import { SQLParser } from '../../lang/SQLParser.js';
import { ConflictError } from '../ConflictError.js';
import { bootstrapCatalog } from './bootstrap/catalog.bootstrap.js';
import { TableStorage } from './TableStorage.js';
import { SYSTEM_TAG } from './TableStorage.js';
import { satisfiesVersionSpec, formatVersion } from './versionSpec.js';
import { ExprEngine } from '../eval/ExprEngine.js';
import { registry } from '../../lang/registry.js';

export class Transaction {

    #engine;
    #id;
    #snapshot
    #strategy;
    #catalog;
    #parser;
    #meta;

    #sysCatalog;
    #exprEngine;

    #affectedSequences = new Set;
    #undoLog = [];
    #finallizeLog = [];
    #changeLog = [];

    #readVersions = new Set;
    #writeVersions = new Set;
    #readKeys = new Set;
    #writeKeys = new Set;
    #predicateReads = [];
    #relationVersionBumps = new Map;

    get engine() { return this.#engine; }
    get id() { return this.#id; }
    get snapshot() { return this.#snapshot; }

    get _strategy() { return this.#strategy; }
    get _catalog() { return this.#catalog; }
    get meta() { return this.#meta; }

    get _affectedSequences() { return this.#affectedSequences; }
    get _undoLog() { return this.#undoLog; }
    get _finallizeLog() { return this.#finallizeLog; }
    get _changeLog() { return this.#changeLog; }

    get _readVersions() { return this.#readVersions; }
    get _writeVersions() { return this.#writeVersions; }
    get _readKeys() { return this.#readKeys; }
    get _writeKeys() { return this.#writeKeys; }
    get _predicateReads() { return this.#predicateReads; }
    get _relationVersionBumps() { return this.#relationVersionBumps; }

    constructor({ engine, id, snapshot, strategy, meta = null }) {
        this.#engine = engine;
        this.#id = id;
        this.#snapshot = snapshot;
        this.#strategy = strategy;
        this.#meta = meta && typeof meta === 'object' ? { ...meta } : meta;

        this.#catalog = new Map([...this.#engine._catalog].map(([relationId, tblGraphs]) => {
            return [relationId, { ...tblGraphs }]
        }));

        this.#parser = new SQLParser({ dialect: this.#engine.dialect });
        this.#exprEngine = new ExprEngine(null, { dialect: this.#engine.dialect });
    }

    // -------

    setXMIN(version, xmin) {
        return this.#strategy.setXMIN(version, xmin);
    }

    matchXMIN(version, xmin) {
        return this.#strategy.matchXMIN(version, xmin);
    }

    setXMAX(version, xmax) {
        return this.#strategy.setXMAX(version, xmax);
    }

    resetXMAX(version, xmax) {
        return this.#strategy.resetXMAX(version, xmax);
    }

    matchXMAX(version, xmax) {
        return this.#strategy.matchXMAX(version, xmax);
    }

    // -------

    trackRead(version, pk) {
        this.#strategy.onRead(this, version, pk);
    }

    trackWrite(version, pk) {
        this.#strategy.onWrite(this, version, pk);
    }

    trackInsertWrite(version, pk) {
        this.#strategy.onInsert(this, version, pk);
    }

    trackPredicateRead(entry) {
        this.#strategy.onPredicateRead(this, entry);
    }

    recordPredicateRead(entry) {
        this.#predicateReads.push(entry);
    }

    // -------

    addUndo(fn) {
        this.#undoLog.push(fn);
    }

    addFinallizer(fn) {
        this.#finallizeLog.push(fn);
    }

    // -------

    validate() {
        this.#strategy.validate(this);
    }

    async commit() {
        return await this.#engine.commit(this);
    }

    async abort() {
        return await this.#engine.abort(this);
    }

    // -------

    nextSequence(seqId) {
        this.#affectedSequences.add(seqId);
        return this.#engine._nextSequence(seqId);
    }

    recordChange(change) {
        this.#changeLog.push(change);

        if (change.relation.namespace === 'sys') {
            this.#invalidateSchemas(change);
        }
    }

    // ----------
    // Changefeed replay
    // ----------

    async replay(changefeed) {
        for (const event of changefeed) {
            const { op, relation, old: oldRow, new: newRow } = event;
            const { namespace, name } = relation;

            const tableStorage = this.getTable({ namespace, name });

            if (op === 'insert') {
                await tableStorage.insert(newRow, { systemTag: SYSTEM_TAG });
            } else if (op === 'update') {
                await tableStorage.update(oldRow, newRow, { systemTag: SYSTEM_TAG });
            } else if (op === 'delete') {
                await tableStorage.delete(oldRow);
            } else {
                throw new Error(`Unknown op type: ${op}`);
            }
        }
    }

    getTable({ ...selector }, { assertIsView = false } = {}) {
        const tblSchema = this.showTable({ ...selector }, { schema: true, assertIsView });
        return new TableStorage(
            this,
            tblSchema,
            { dialect: this.#engine.dialect }
        );
    }

    // -------

    #getSysCatalog(bootstrap = false) {
        if (bootstrap) return bootstrapCatalog;
        if (this.#sysCatalog) return this.#sysCatalog;

        const sysCatalog = new Map(['sys_namespaces', 'sys_relations', 'sys_types', 'sys_columns', 'sys_constraints', 'sys_indexes', 'sys_dependencies', 'sys_sync_jobs', 'sys_outsync_queue'].map(
            (n) => [n, this.getTable({ namespace: 'sys', name: n })],
        ));
        this.#sysCatalog = sysCatalog;

        return sysCatalog;
    }

    #buildSchema(tblDef) {
        const sysCatalog = this.#getSysCatalog(tblDef.namespace_id.name === 'sys' || tblDef.namespace_id.id === 1);

        const schemaGraph = { ...tblDef };

        // Columns
        const columns = sysCatalog.get('sys_columns')
            .get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true })
            .map((col) => {
                const relation_id = schemaGraph;

                const type_id = sysCatalog.get('sys_types').get(col.type_id)
                    || bootstrapCatalog.get('sys_types').get(col.type_id);
                if (!type_id) throw new ReferenceError(`The type_id reference (${col.type_id}) could not be resolved at relation ${tblDef.name}, column ${col.name}`);

                return Object.freeze({ ...col, type_id, relation_id });
            });
        schemaGraph.columns = new Map(columns.sort((a, b) => a.position < b.position ? -1 : 1).map((col) => [col.name, col]));

        // Constraints
        const constraints = sysCatalog.get('sys_constraints')
            .get({ relation_id: tblDef.id }, { using: 'sys_constraints__relation_id_idx', multiple: true })
            .map((con) => {
                const relation_id = schemaGraph;

                const column_ids = (con.column_ids || []).map((id) => {
                    const col = columns.find((c) => c.id === id);
                    if (!col) throw new ReferenceError(`The column_id reference (${id}) could not be resolved at relation ${tblDef.name}, constraint ${con.name}`);
                    return col;
                });

                let fk_target_relation_id = con.fk_target_relation_id;
                if (con.fk_target_relation_id) {
                    fk_target_relation_id = sysCatalog.get('sys_relations').get(con.fk_target_relation_id);
                    if (!fk_target_relation_id) throw new ReferenceError(`The fk_target_relation_id reference (${con.fk_target_relation_id}) could not be resolved at relation ${tblDef.name}, column ${con.name}`);
                    fk_target_relation_id = Object.freeze({ ...fk_target_relation_id });
                }

                let fk_target_column_ids = con.fk_target_column_ids;
                if (con.fk_target_column_ids?.length) {
                    fk_target_column_ids = con.fk_target_column_ids.map((id) => {
                        const col = sysCatalog.get('sys_columns').get(id);
                        if (!col) throw new ReferenceError(`The fk_target_column_id reference (${id}) could not be resolved at relation ${tblDef.name}, column ${col.name}`);
                        return Object.freeze(col);
                    });
                }

                return Object.freeze({
                    ...con,
                    relation_id,
                    column_ids,
                    fk_target_relation_id,
                    fk_target_column_ids,
                });
            });
        schemaGraph.constraints = new Map(constraints.reduce((acc, con) => {
            const group = acc.find((x) => x[0] === con.kind);
            if (group) group[1].push(con);
            else acc.push([con.kind, [con]]);
            return acc;
        }, []));

        // keyColumns
        const keyColumns = constraints.find((con) => con.kind === 'PRIMARY KEY')
            ?.column_ids.map((col) => col.name) || [];
        schemaGraph.keyColumns = Object.freeze(keyColumns);

        // Indexes
        const indexes = sysCatalog.get('sys_indexes')
            .get({ relation_id: tblDef.id }, { using: 'sys_indexes__relation_id_idx', multiple: true })
            .map((idx) => {
                let column_ids;
                let expression_ast;
                let predicate_ast;

                if (idx.kind === 'column') {
                    column_ids = idx.column_ids
                        .map((id) => columns.find((col) => id === col.id));
                } else if (idx.kind === 'expression') {
                    expression_ast = idx.expression_ast;
                }

                if (idx.predicate_ast) {
                    predicate_ast = idx.predicate_ast;
                    // idx.predicate_ast is AST
                }

                // idx.method = 'hash' for now, 'btree' eventually

                return Object.freeze({
                    ...idx,
                    column_ids,
                    expression_ast,
                    predicate_ast,
                });
            });
        schemaGraph.indexes = new Map(indexes.map((idx) => [idx.name, idx]));

        // Dependencies
        schemaGraph.dependents = [];

        return Object.freeze(schemaGraph);
    }

    #invalidateSchemas(change) {
        if (['sys_namespaces', 'sys_relations'].includes(change.relation.name)
            && change.op !== 'insert')
            return;

        for (const [, tblGraphs] of this.#catalog) {
            if (tblGraphs.schema?.namespace_id.name === 'sys') continue;

            delete tblGraphs.schema;
        }
    }

    // ----------
    // Namespace
    // ----------

    listNamespaces(filter = null) {
        const filterFn = typeof filter === 'function' ? filter : null;

        const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });
        let nsDefs = sysNs.getAll();

        if (filterFn) nsDefs = nsDefs.filter(filterFn);

        return nsDefs.map((ns) => ns.name);
    }

    showNamespace({ name, id = null }, { ifExists = false } = {}) {
        const sysCatalog = this.#getSysCatalog(name === 'sys' || id === 1);

        const nsDef = id
            ? sysCatalog.get('sys_namespaces').get({ id })
            : sysCatalog.get('sys_namespaces').get({ name }, { using: 'sys_namespaces__name_idx' });
        if (!nsDef) {
            if (ifExists) return null;
            throw new ReferenceError(`Namespace ${name && JSON.stringify(name) || id} does not exist`);
        }

        return Object.freeze(nsDef);
    }

    async createNamespace({
        name,
        kind = 'schema',
        owner = null,
        replication_origin = null,
        replication_origin_type = null,
        engine_attrs = null
    }, { ifNotExists = false } = {}) {
        if (!/^[a-zA-Z_]/.test(name))
            throw new Error(`Namespace name must start with a letter or underscore`);

        if (!['schema'].includes(kind))
            throw new Error(`Invalid namespace kind ${kind}`);

        if (![undefined, null].includes(owner) && !/^[a-zA-Z_]/.test(owner))
            throw new Error(`Namespace owner name must start with a letter or underscore`);

        if (replication_origin_type && !replication_origin)
            throw new Error(`Unexpected property "replication_origin_type" for unspecified "replication_origin"`);

        const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });

        const existing = sysNs.get({ name }, { using: 'sys_namespaces__name_idx' });
        if (existing) {
            if (ifNotExists) return null;
            throw new ConflictError(`Namespace ${JSON.stringify(name)} already exists`, existing);
        }

        return await sysNs.insert({
            name,
            kind,
            owner,
            replication_origin,
            replication_origin_type,
            engine_attrs
        });
    }

    async alterNamespace({
        name
    }, {
        name: newName = undefined,
        owner: newOwner = undefined,
        replication_origin: newReplicationOrigin = undefined,
        replication_origin_type: newReplicationOriginType = undefined,
        engine_attrs: newEngineAttrs = undefined
    }) {
        const nsDef = this.showNamespace({ name });
        const newDef = {};

        if (newName !== undefined) {
            if (newName === null) throw new Error(`[NAMESPACE] Namespace name cannot be null`);
            if (!/^[a-zA-Z_]/.test(newName))
                throw new Error(`[NAMESPACE] Namespace name must start with a letter or underscore`);
            newDef.name = newName;
        }

        if (newOwner !== undefined) {
            if (newOwner !== null && !/^[a-zA-Z_]/.test(newOwner))
                throw new Error(`[NAMESPACE] Owner name must start with a letter or underscore`);
            newDef.owner = newOwner;
        }

        if (newReplicationOriginType !== undefined) newDef.replication_origin_type = newReplicationOriginType;

        if (newReplicationOrigin !== undefined) {
            newDef.replication_origin = newReplicationOrigin;
        }

        if (newEngineAttrs !== undefined) newDef.engine_attrs = newEngineAttrs;

        const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });
        return await sysNs.update(nsDef, newDef);
    }

    async dropNamespace({ name }, { ifExists = false, cascade = false } = {}) {
        const nsDef = this.showNamespace({ name }, { ifExists });
        nsDef && await this.#dropNamespaces([nsDef], cascade);
    }

    // ----------
    // Table
    // ----------

    listTables(filter = null, { details = false } = {}) {
        if (typeof filter === 'boolean') {
            details = filter;
            filter = null;
        }
        const filterFn = typeof filter === 'function' ? filter : null;
        const { namespace, kind, persistence } = typeof filter === 'object' && filter ? filter : {};

        const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });

        let tblDefs;

        if (namespace) {
            const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });

            const nsDef = sysNs.get({ name: namespace }, { using: 'sys_namespaces__name_idx' });
            if (!nsDef) throw new Error(`Namespace ${JSON.stringify(namespace)} does not exist`);

            tblDefs = sysTables.get({ namespace_id: nsDef.id }, { using: 'sys_relations__namespace_id_idx', multiple: true });
        } else tblDefs = sysTables.getAll();

        if (filterFn) tblDefs = tblDefs.filter(filterFn);

        if (kind) tblDefs = tblDefs.filter((tblDef) => tblDef.kind === kind);
        if (persistence) tblDefs = tblDefs.filter((tblDef) => tblDef.persistence === persistence);

        if (!details) return tblDefs.map((tblDef) => tblDef.name);
        return tblDefs.map((tblDef) => Object.freeze({
            ...tblDef,
            namespace_id: Object.freeze(this.showNamespace({ id: tblDef.namespace_id })),
        }));
    }

    showTable({ namespace, namespace_id = null, name, id = null, versionSpec = null }, { schema = false, ifExists = false, assertIsView = false } = {}) {
        const sysCatalog = this.#getSysCatalog(namespace === 'sys' || namespace_id === 1);
        let nsDef, tblDef;

        if (id) {
            tblDef = sysCatalog.get('sys_relations').get({ id });
            if (name && tblDef && name !== tblDef.name)
                throw new Error(`Invalid name ${name} input for relation ${id}`);

            if (typeof namespace_id === 'object' && namespace_id) {
                nsDef = namespace_id;
                if (tblDef && namespace_id.id !== tblDef.namespace_id)
                    throw new Error(`Invalid namespace ${namespace_id.name} input for relation ${id}`);
            } else {
                nsDef = tblDef && this.showNamespace({ id: tblDef.namespace_id }, { ifExists: true });
                if (nsDef && (namespace && namespace !== nsDef.name || namespace_id && namespace_id !== nsDef.id))
                    throw new Error(`Invalid namespace ${namespace} input for relation ${id}`);
            }
        } else {
            nsDef = this.showNamespace({ name: namespace, id: namespace_id }, { ifExists });
            if (!nsDef) return null;

            tblDef = sysCatalog.get('sys_relations').get({ namespace_id: nsDef.id, name }, { using: 'sys_relations__namespace_id_name_idx' });
        }

        if (!tblDef) {
            if (ifExists) return null;
            throw new Error(`Relation ${JSON.stringify(namespace)}.${JSON.stringify(name)} does not exist`);
        }

        if (assertIsView && tblDef.kind !== 'view') {
            if (ifExists) return null;
            throw new Error(`Relation ${JSON.stringify(namespace)}.${JSON.stringify(name)} is not a view`);
        }

        if (versionSpec && !satisfiesVersionSpec({
            major: tblDef.version_major,
            minor: tblDef.version_minor,
            patch: tblDef.version_patch,
        }, versionSpec)) {
            if (ifExists) return null;
            const relationName = `${JSON.stringify(nsDef?.name || namespace)}.${JSON.stringify(tblDef.name || name)}`;
            const currentVersion = formatVersion({
                major: tblDef.version_major,
                minor: tblDef.version_minor,
                patch: tblDef.version_patch,
            });
            throw new Error(`Relation ${relationName} is at version ${currentVersion}, which does not satisfy ${JSON.stringify(versionSpec)}`);
        }

        const resultDef = Object.freeze({
            ...tblDef,
            namespace_id: Object.freeze(nsDef)
        });

        return schema
            ? this.#buildSchema(resultDef)
            : resultDef;
    }

    async createTable({
        namespace,
        name,
        kind = 'table',
        persistence = 'permanent',
        view_spec = null,
        engine_attrs = null,
        columns = [],
        constraints = [],
        indexes = [],
    }, { ifNotExists = false } = {}) {
        if (!/^[a-zA-Z_]/.test(name))
            throw new Error(`Relation name must start with a letter or underscore`);

        const nsDef = this.showNamespace({ name: namespace });

        const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });

        const existing = sysTables.get({ namespace_id: nsDef.id, name }, { using: 'sys_relations__namespace_id_name_idx' });
        if (existing) {
            if (ifNotExists) return null;
            throw new ConflictError(`Relation ${JSON.stringify(name)} already exists`, existing);
        }

        let reservedColumnConflict;
        if (reservedColumnConflict = columns.find((col) => col.name.startsWith('__'))) {
            throw new Error(`[${reservedColumnConflict}] Reserved column namespace "__*"`);
        }

        if (!['table', 'view'].includes(kind))
            throw new Error(`Invalid relation kind setting ${kind}`);

        if (kind === 'table') {
            if (!['permanent', 'temporary'].includes(persistence))
                throw new Error(`Invalid persistence setting ${persistence} for a non-view relation`);
            if (view_spec)
                throw new Error(`Unexpected property "view_spec" for a non-view relation`);
        } else /* view */ {
            if (!['materialized', 'realtime', 'origin'].includes(persistence))
                throw new Error(`Invalid persistence setting ${persistence} for a view relation`);
            if (!view_spec)
                throw new Error(`Missing required property "view_spec" for a view relation`);
            if (typeof view_spec !== 'object')
                throw new Error(`The "view_spec" property must be an object`);

            let derivedColumns;
            if (view_spec.query) {
                const validQueryKeys = ['query', 'joinStrategy'];
                for (const key in view_spec) {
                    if (!validQueryKeys.includes(key))
                        throw new SyntaxError(`Unexpected property "${key}" in query-type view spec`);
                }

                const schemaInference = await this.#engine.getSourceResolver(nsDef);
                const query = await this.#parser.parse(view_spec.query);
                const resolvedQuery = await schemaInference.resolveQuery(query, { tx: this });
                view_spec.query = resolvedQuery.jsonfy();

                derivedColumns = resolvedQuery.resultSchema().entries().map((col) => this.#parser.columnAST_to_columnDef(col));
            } else {
                // Validation for Reference-defined source
                const validRefKeys = ['namespace', 'name', 'filters', 'joinStrategy'];
                for (const key in view_spec) {
                    if (!validRefKeys.includes(key))
                        throw new SyntaxError(`Unexpected property "${key}" in reference-type view spec.`);
                }

                if (!view_spec.name)
                    throw new SyntaxError(`Missing required property "name" in reference-type view spec.`);

                if (view_spec.filters) {
                    if (typeof view_spec.filters !== 'object' || Array.isArray(view_spec.filters))
                        throw new TypeError(`Property "filters" in view spec must be an object`);
                }

                const schemaInference = await this.#engine.getSourceResolver(nsDef);
                const originNs = view_spec.namespace || namespace;
                const [tblSchema] = await schemaInference.showCreate({ [originNs]: view_spec.name }, { tx: this });
                if (!tblSchema) {
                    throw new ReferenceError(`Origin relation ${JSON.stringify(originNs)}.${JSON.stringify(view_spec.name)} could not be resolved`);
                }

                ({ columns: derivedColumns, constraints } = this.#parser.tableAST_to_tableDef(tblSchema, { namespace: originNs }));
            }

            if (columns.length) {
                if (columns.length !== derivedColumns.length) {
                    throw new Error(`View column list has ${columns.length} column(s), but query returns ${derivedColumns.length}`);
                }
                columns = derivedColumns.map((col, i) => {
                    if (!columns[i].name) throw new TypeError(`Input column #${i} is missing a name property.`)
                    return { ...col, name: columns[i].name || col.name };
                });
            } else {
                columns = derivedColumns;
            }
        }

        if (!constraints.find((con) => con.kind === 'PRIMARY KEY')) {
            if (kind === 'view' && view_spec.query && persistence === 'realtime') {
                columns = [{ name: '__id', type: 'TEXT', not_null: true, engine_attrs: { is_system_column: true } }].concat(columns);
                constraints = [{ kind: 'PRIMARY KEY', columns: ['__id'] }].concat(constraints);
            } else {
                columns = [{ name: '__id', type: 'INT', is_generated: true, generation_rule: 'by_default', engine_attrs: { is_system_column: true } }].concat(columns);
                constraints = [{ kind: 'PRIMARY KEY', columns: ['__id'] }].concat(constraints);
            }
        }

        const resultTbl = await sysTables.insert({
            namespace_id: nsDef.id,
            name,
            kind,
            persistence,
            view_spec,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
            engine_attrs,
        }, { systemTag: SYSTEM_TAG });

        let resultCols = [];
        if (columns?.length) resultCols = await this.#insertColumns(resultTbl, columns);
        if (constraints?.length) await this.#insertConstraints(resultTbl, constraints, resultCols);
        if (indexes?.length) await this.#insertIndexes(resultTbl, indexes, resultCols);

        return resultTbl;
    }

    async alterTable({
        namespace,
        name
    }, {
        namespace: newNamespace = null,
        name: newName = null,
        view_spec: newViewSpec = null,
        view_columns: newViewColumns = null,
        persistence: newPersistence = null,
        engine_attrs: newEngineAttrs = null,
        actions = [],
        assertIsView = false,
    }) {
        const tblDef = this.showTable({ namespace, name }, { assertIsView });

        if (tblDef.kind === 'table') {
            if (newViewSpec)
                throw new Error(`Unexpected "view_spec" attribute for a non-view relation`);
        }

        const newDef = {};
        let returnValue;
        let versionBump = 0;

        if (newNamespace) {
            const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });

            const newNs = sysNs.get({ name: newNamespace }, { using: 'sys_namespaces__name_idx' });
            if (!newNs) throw new Error(`Target namespace ${JSON.stringify(newNamespace)} does not exist`);

            newDef.namespace_id = newNs.id;
            versionBump = Math.max(versionBump, 3);
        }

        if (newName) {
            if (!/^[a-zA-Z_]/.test(newName))
                throw new Error(`Relation name must start with a letter or underscore`);
            newDef.name = newName;
            versionBump = Math.max(versionBump, 3);
        }

        if (newPersistence) {
            if (tblDef.kind !== 'view') {
                throw new Error(`Unexpected "persistence" attribute for a non-view relation`);
            }
            newDef.persistence = newPersistence;
            versionBump = Math.max(versionBump, 3);
        }

        if (newViewSpec) {
            if (tblDef.kind !== 'view') {
                throw new Error(`Unexpected "view_spec" attribute for a non-view relation`);
            }
            const nsDef = this.showNamespace({ id: tblDef.namespace_id.id });
            if (newViewSpec.query) {
                const query = await this.#parser.parse(newViewSpec.query);
                const schemaInference = await this.#engine.getSourceResolver(nsDef);
                const resolvedQuery = await schemaInference.resolveQuery(query, { tx: this });
                newViewSpec = { ...newViewSpec, query: resolvedQuery.jsonfy() };

                const derivedColumns = resolvedQuery.resultSchema().entries().map((col) => this.#parser.columnAST_to_columnDef(col));
                if (newViewColumns?.length) {
                    if (newViewColumns.length !== derivedColumns.length) {
                        throw new Error(`View column list has ${newViewColumns.length} column(s), but query returns ${derivedColumns.length}`);
                    }
                    newViewColumns = derivedColumns.map((col, i) => ({ ...col, name: newViewColumns[i].name || col.name }));
                } else {
                    newViewColumns = derivedColumns;
                }
            }

            newDef.view_spec = newViewSpec;
            if (newViewColumns?.length) await this.#replaceViewColumns(tblDef, newViewColumns);
            versionBump = Math.max(versionBump, 3);
        }
        if (newEngineAttrs) {
            newDef.engine_attrs = newEngineAttrs;
            versionBump = Math.max(versionBump, 1);
        }

        if (actions?.length) {
            for (const action of actions) {
                if (action.type === 'add_column') {
                    await this.#addColumnsToRelation(tblDef, [action.column]);
                    versionBump = Math.max(versionBump, 2);
                } else if (action.type === 'add_constraint') {
                    await this.#addConstraintsToRelation(tblDef, [action.constraint]);
                    versionBump = Math.max(versionBump, 2);
                } else if (action.type === 'add_index') {
                    await this.#addIndexesToRelation(tblDef, [action.index]);
                } else if (action.type === 'alter_column') {
                    await this.#alterColumnInRelation(tblDef, action.name, action);
                    versionBump = Math.max(versionBump, 1);
                } else if (action.type === 'rename_column') {
                    await this.#renameColumnInRelation(tblDef, action.oldName, action.name);
                    versionBump = Math.max(versionBump, 2);
                } else if (action.type === 'rename_index') {
                    await this.#renameIndexInRelation(tblDef, action.oldName, action.name);
                    versionBump = Math.max(versionBump, 2);
                } else if (action.type === 'drop_column') {
                    await this.#dropColumnsFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
                    versionBump = Math.max(versionBump, 2);
                } else if (action.type === 'drop_constraint') {
                    await this.#dropConstraintsFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
                    versionBump = Math.max(versionBump, 2);
                } else if (action.type === 'drop_index') {
                    await this.#dropIndexesFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
                    versionBump = Math.max(versionBump, 2);
                } else {
                    throw new Error(`Unsupported ALTER TABLE action ${JSON.stringify(action.type)}`);
                }
            }
        }

        if (versionBump) {
            Object.assign(newDef, this.#nextVersion(tblDef, versionBump));
        }

        if (Object.keys(newDef).length) {
            const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });
            returnValue = await sysTables.update(tblDef, newDef, { systemTag: SYSTEM_TAG });
        }

        return returnValue;
    }

    async dropTable({ namespace, name }, { ifExists = false, cascade = false, assertIsView = false } = {}) {
        const tblDef = this.showTable({ namespace, name }, { ifExists, assertIsView });
        tblDef && await this.#dropRelations([tblDef], cascade);
    }

    // ----------
    // View
    // ----------

    listViews(filter = null, { details = false } = {}) {
        if (typeof filter === 'boolean') {
            details = filter;
            filter = null;
        }
        const filterFn = typeof filter === 'function' ? filter : null;
        const { namespace, persistence } = typeof filter === 'object' && filter ? filter : {};

        if (filterFn) {
            return this.listTables((tblDef) => {
                if (tblDef.kind !== 'view') return false;
                return filterFn(tblDef);
            }, { details });
        }

        return this.listTables({ namespace, kind: 'view', persistence }, { details });
    }

    showView({ namespace, namespace_id = null, name, id = null }, { schema = false, ifExists = false } = {}) {
        return this.showTable({ namespace, namespace_id, name, id }, { schema, ifExists, assertIsView: true });
    }

    async createView({ kind, ...createTableSpec }, createTableOpts = {}) {
        return await this.createTable({ ...createTableSpec, kind: 'view' }, createTableOpts);
    }

    async alterView(alterTableSpec, alterTableOpts) {
        return await this.alterTable(alterTableSpec, { ...alterTableOpts, assertIsView: true });
    }

    async dropView(dropTableSpec, dropTableOpts) {
        return await this.dropTable(dropTableSpec, { ...dropTableOpts, assertIsView: true });
    }

    async resetView(tableRef) {
        const tableStorage = this.getTable(tableRef, { assertIsView: true });
        await tableStorage.truncate();
    }

    async refreshView(tableRef) {
        const viewDef = this.showView(tableRef, { schema: true });
        const querySpec = { ...(viewDef.view_spec || {}) };

        if (!querySpec.name && !querySpec.query) {
            throw new Error(`View ${JSON.stringify(viewDef.name)} has invalid view_spec`);
        }
        if (!querySpec.query) {
            querySpec.namespace = querySpec.namespace || viewDef.namespace_id.name;
        }

        const sourceClient = await this.#engine.getSourceClient(viewDef.namespace_id);
        const result = await sourceClient.query(querySpec);
        const rows = result?.rows || [];
        const preparedRows = rows.map((row) => this.#prepareViewRowForStorage(viewDef, row));

        await this.resetView(tableRef);
        const tableStorage = this.getTable(tableRef, { assertIsView: true });
        for (const row of preparedRows) {
            await tableStorage.insert(row, { systemTag: SYSTEM_TAG });
        }

        return preparedRows.length;
    }

    // ----------
    // Index
    // ----------

    showIndex({ namespace, table = null, name }) {
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });
        if (table) {
            const tblDef = this.showTable({ namespace, name: table });
            const idx = sysIndexes.get({ relation_id: tblDef.id, name }, { using: 'sys_indexes__relation_id_name_idx' });
            if (!idx) throw new Error(`Index ${JSON.stringify(name)} does not exist`);
            return { idx, tblDef };
        }

        const tblDefs = this.listTables({ namespace }, { details: true });
        const matches = [];
        for (const tblDef of tblDefs) {
            const idx = sysIndexes.get({ relation_id: tblDef.id, name }, { using: 'sys_indexes__relation_id_name_idx' });
            if (idx) matches.push({ idx, tblDef });
        }

        if (!matches.length) throw new Error(`Index ${JSON.stringify(name)} does not exist`);
        if (matches.length > 1) throw new Error(`Index name ${JSON.stringify(name)} is ambiguous within namespace ${JSON.stringify(namespace)}`);
        return matches[0];
    }

    async createIndex({ namespace, table, ...idx }) {
        const tblDef = this.showTable({ namespace, name: table });
        const [resultIdx] = await this.#insertIndexes(tblDef, [idx]);
        return resultIdx;
    }

    async alterIndex({ namespace, table = null, name }, { name: newName, namespace: newNamespace = null }) {
        const { idx, tblDef } = this.showIndex({ namespace, table, name });
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });
        if (newNamespace && newNamespace !== tblDef.namespace_id.name) {
            await this.alterTable(
                { namespace: tblDef.namespace_id.name, name: tblDef.name },
                { namespace: newNamespace }
            );
        }
        return newName ? await sysIndexes.update(idx, { name: newName }) : idx;
    }

    async dropIndex({ namespace, table = null, name, cascade = false }) {
        const { idx } = this.showIndex({ namespace, table, name });
        await this.#dropIndexes([idx], cascade);
    }

    // ---------------

    async #addColumnsToRelation(tblDef, columns) {
        await this.#insertColumns(tblDef, columns);
        await this.#rewriteRelationRows(tblDef, (row) => ({ ...row }));
    }

    async #addConstraintsToRelation(tblDef, constraints) {
        await this.#validateConstraintsOnExistingRows(tblDef, constraints);
        await this.#insertConstraints(tblDef, constraints);
    }

    async #addIndexesToRelation(tblDef, indexes) {
        await this.#validateIndexesOnExistingRows(tblDef, indexes);
        await this.#insertIndexes(tblDef, indexes);
    }

    async #alterColumnInRelation(tblDef, columnName, { operation, expr }) {
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const col = sysColumns.get({ relation_id: tblDef.id, name: columnName }, { using: 'sys_columns__relation_id_name_idx' });
        if (!col) throw new Error(`Column ${JSON.stringify(columnName)} does not exist`);
        if (operation === 'SET DEFAULT') {
            await sysColumns.update(col, { default_expr_ast: expr });
        } else if (operation === 'DROP DEFAULT') {
            await sysColumns.update(col, { default_expr_ast: null });
        } else if (operation === 'SET NOT NULL') {
            await this.#assertNoNulls(tblDef, columnName);
            await sysColumns.update(col, { not_null: true });
        } else if (operation === 'DROP NOT NULL') {
            await sysColumns.update(col, { not_null: false });
        } else {
            throw new Error(`Unsupported ALTER COLUMN operation ${JSON.stringify(operation)}`);
        }
    }

    async #renameColumnInRelation(tblDef, oldName, newName) {
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const col = sysColumns.get({ relation_id: tblDef.id, name: oldName }, { using: 'sys_columns__relation_id_name_idx' });
        if (!col) throw new Error(`Column ${JSON.stringify(oldName)} does not exist`);
        await sysColumns.update(col, { name: newName });
        await this.#rewriteRelationRows(tblDef, (row) => {
            const nextRow = { ...row, [newName]: row[oldName] };
            delete nextRow[oldName];
            return nextRow;
        });
    }

    async #renameIndexInRelation(tblDef, oldName, newName) {
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });
        const idx = sysIndexes.get({ relation_id: tblDef.id, name: oldName }, { using: 'sys_indexes__relation_id_name_idx' });
        if (!idx) throw new Error(`Index ${JSON.stringify(oldName)} does not exist`);
        await sysIndexes.update(idx, { name: newName });
    }

    async #dropColumnsFromRelation(tblDef, columnNames, { cascade = false } = {}) {
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const cols = columnNames.map((columnName) => {
            const col = sysColumns.get({ relation_id: tblDef.id, name: columnName }, { using: 'sys_columns__relation_id_name_idx' });
            if (!col) throw new Error(`Column ${JSON.stringify(columnName)} does not exist`);
            return col;
        });
        await this.#dropColumns(cols, cascade);
        await this.#rewriteRelationRows(tblDef, (row) => {
            const nextRow = { ...row };
            for (const columnName of columnNames) delete nextRow[columnName];
            return nextRow;
        });
    }

    async #dropConstraintsFromRelation(tblDef, constraintNames, { cascade = false } = {}) {
        const sysConstraints = this.getTable({ namespace: 'sys', name: 'sys_constraints' });
        const constraints = constraintNames.map((constraintName) => {
            const con = sysConstraints.get({ relation_id: tblDef.id, name: constraintName }, { using: 'sys_constraints__relation_id_name_idx' });
            if (!con) throw new Error(`Constraint ${JSON.stringify(constraintName)} does not exist`);
            return con;
        });
        await this.#dropConstraints(constraints, cascade);
    }

    async #dropIndexesFromRelation(tblDef, indexNames, { cascade = false } = {}) {
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });
        const indexes = indexNames.map((indexName) => {
            const idx = sysIndexes.get({ relation_id: tblDef.id, name: indexName }, { using: 'sys_indexes__relation_id_name_idx' });
            if (!idx) throw new Error(`Index ${JSON.stringify(indexName)} does not exist`);
            return idx;
        });
        await this.#dropIndexes(indexes, cascade);
    }

    async #replaceViewColumns(tblDef, columns) {
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const currentCols = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
        const userColumns = currentCols.filter((col) => !col.engine_attrs?.is_system_column);
        if (userColumns.length) await this.#dropColumns(userColumns, true);
        await this.#insertColumns(tblDef, columns);
        await this.#rewriteRelationRows(tblDef, (row) => {
            const nextRow = {};
            for (const [key, value] of Object.entries(row)) {
                if (key.startsWith('__')) nextRow[key] = value;
            }
            return nextRow;
        });
    }

    // ----------
    // Insert handlers
    // ----------

    async #insertColumns(tblDef, columns) {
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const sysTypes = this.getTable({ namespace: 'sys', name: 'sys_types' });
        const altSysTypes = bootstrapCatalog.get('sys_types');

        const resultCols = [];
        const existingCols = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
        let position = existingCols.reduce((max, col) => Math.max(max, col.position), 0) + 1;

        for (const _col of columns) {
            const col = await this.#parser.resolve_columnDef(_col, (col, prop) => {
                if (prop === 'type') {
                    col.type_id = sysTypes.get({ namespace_id: 1, name: col.type }, { using: 'sys_types__namespace_id_name_idx' })?.id
                        || altSysTypes.get({ namespace_id: 1, name: col.type }, { using: true })?.id;
                    if (!col.type_id) throw new Error(`[${col.name}] Unknown column type "${col.type}"`);
                } else if (prop === 'type_id') {
                    if (typeof col.type_id !== 'object')
                        throw new Error(`[${col.name}] The system "type_id" property must be an object`);
                    col.type_id = col.type_id.id;
                }
            });

            const resultCol = await sysColumns.insert({
                relation_id: tblDef.id,
                name: col.name,
                type_id: col.type_id,
                not_null: col.not_null,
                is_generated: col.is_generated,
                generation_expr_ast: col.generation_expr_ast,
                generation_rule: col.generation_rule,
                default_expr_ast: col.default_expr_ast,
                position: position++,
                engine_attrs: col.engine_attrs,
            });

            resultCols.push(resultCol);
        }

        return resultCols;
    }

    async #insertConstraints(tblDef, constraints, tblCols = null) {
        const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });
        const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const sysConstraints = this.getTable({ namespace: 'sys', name: 'sys_constraints' });
        const sysDependencies = this.getTable({ namespace: 'sys', name: 'sys_dependencies' });

        if (!tblCols) tblCols = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
        const resultCons = [];

        for (const _con of constraints) {
            const con = await this.#parser.resolve_constraintDef(_con, (con, prop) => {
                const conDisplayName = con.name || 'CONSTRAINT';

                if (prop === 'columns') {
                    con.column_ids = con.columns.map((colName) => {
                        const colDef = tblCols.find((colDef) => colDef.name === colName);
                        if (!colDef) throw new Error(`[${conDisplayName}] Unknown column: ${colName}`);
                        return colDef.id;
                    });
                } else if (prop === 'column_ids') {
                    if (!con.column_ids.every((x) => x && typeof x === 'object'))
                        throw new Error(`[${conDisplayName}] The system "column_ids" property must be a list of objects`);
                    con.column_ids = con.column_ids.map((_colDef) => {
                        const colDef = tblCols.find((colDef) => colDef.id === _colDef.id);
                        if (!colDef) throw new Error(`[${conDisplayName}] Unknown column: ${_colDef.name}`);
                        return colDef.id;
                    });
                }

                if (prop === 'target_namespace') {
                    con.fk_target_namespace_id = sysNs.get({ name: con.target_namespace }, { using: 'sys_namespaces__name_idx' })?.id;
                    if (!con.fk_target_namespace_id)
                        throw new Error(`[${conDisplayName}] Unknown target namespace: ${con.target_namespace}`);
                } else if (prop === 'fk_target_namespace_id') {
                    if (typeof con.fk_target_namespace_id !== 'object')
                        throw new Error(`[${conDisplayName}] The system "fk_target_namespace_id" property must be an object`);
                    if (con.fk_target_namespace_id.id !== tblDef.namespace_id && !sysNs.exists(con.fk_target_namespace_id))
                        throw new Error(`[${conDisplayName}] Unknown target namespace: ${con.fk_target_namespace_id.name}`);
                }

                if (prop === 'target_relation') {
                    con.fk_target_relation_id = con.fk_target_namespace_id === tblDef.namespace_id && con.target_relation === tblDef.name
                        ? tblDef.id
                        : sysTables.get({ namespace_id: con.fk_target_namespace_id || tblDef.namespace_id, name: con.target_relation }, { using: 'sys_relations__namespace_id_name_idx' })?.id;

                    if (!con.fk_target_relation_id)
                        throw new Error(`[${conDisplayName}] Unknown target relation: ${con.target_relation}`);
                } else if (prop === 'fk_target_relation_id') {
                    if (typeof con.fk_target_relation_id !== 'object')
                        throw new Error(`[${conDisplayName}] The system "fk_target_relation_id" property must be an object`);
                    if (con.fk_target_relation_id.id !== tblDef.id && !sysTables.exists(con.fk_target_relation_id))
                        throw new Error(`[${conDisplayName}] Unknown target relation: ${con.fk_target_relation_id.name}`);
                }

                if (prop === 'target_columns') {
                    con.fk_target_column_ids = con.target_columns.map((colName) => {
                        const colDef = con.fk_target_relation_id === tblDef.id
                            ? tblCols.find((colDef) => colDef.name === colName)
                            : sysColumns.get({ relation_id: con.fk_target_relation_id, name: colName }, { using: 'sys_columns__relation_id_name_idx' });
                        if (!colDef) throw new Error(`[${conDisplayName}] Unknown column: ${colName}`);

                        return colDef.id;
                    });
                } else if (prop === 'fk_target_column_ids') {
                    if (!con.fk_target_column_ids.every((x) => x && typeof x === 'object'))
                        throw new Error(`[${conDisplayName}] The system "fk_target_column_ids" property must be a list of objects`);
                    con.fk_target_column_ids = con.fk_target_column_ids.map((_colDef) => {
                        const colDef = con.fk_target_relation_id === tblDef.id
                            ? tblCols.find((colDef) => colDef.id === _colDef.id)
                            : sysColumns.get({ id: _colDef.id });
                        if (!colDef) throw new Error(`[${conDisplayName}] Unknown column: ${_colDef.name}`);

                        return colDef.id;
                    });
                }
            });

            if (!con.name) {
                const k = con.kind === 'CHECK' ? 'ck' : (con.kind === 'UNIQUE' ? 'uk' : (con.kind === 'FOREIGN KEY' ? 'fk' : 'pk'));
                con.name = `${tblDef.name}__${con.columns.join('_')}_${k}`;
            }

            const resultCon = await sysConstraints.insert({
                relation_id: tblDef.id,
                name: con.name,
                kind: con.kind,
                column_ids: con.column_ids,
                ck_expression_ast: con.ck_expression_ast,
                fk_target_relation_id: con.fk_target_relation_id,
                fk_target_column_ids: con.fk_target_column_ids,
                fk_match_rule: con.fk_match_rule,
                fk_update_rule: con.fk_update_rule,
                fk_delete_rule: con.fk_delete_rule,
            });

            if (con.kind === 'UNIQUE' || con.kind === 'FOREIGN KEY') {
                const [resultIdx] = await this.#insertIndexes(tblDef, [{
                    name: con.name.replace(/(_uk|_fk)$/, '_idx'),
                    kind: 'column',
                    method: 'hash',
                    is_unique: con.kind === 'UNIQUE',
                    column_ids: con.column_ids.map((id) => ({ id })),
                }], tblCols);

                await sysDependencies.insert({
                    dependent_object_id: resultIdx.id,
                    dependent_object_kind: 'index',
                    referenced_object_id: resultCon.id,
                    referenced_object_kind: 'constraint',
                    dependency_tag: 'constraint_backing_index'
                });
            }

            resultCons.push(resultCon);
        }

        return resultCons;
    }

    async #insertIndexes(tblDef, indexes, tblCols = null) {
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });

        if (!tblCols) tblCols = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
        const resultIdxs = [];

        for (const _idx of indexes) {
            const idx = await this.#parser.resolve_indexDef(_idx, (idx, prop) => {
                const idxDisplayName = idx.name || 'INDEX';

                if (prop === 'columns') {
                    idx.column_ids = idx.columns.map((colName) => {
                        const colDef = tblCols.find((colDef) => colDef.name === colName);
                        if (!colDef) throw new Error(`[${idxDisplayName}] Unknown column: ${colName}`);
                        return colDef.id;
                    });
                } else if (prop === 'column_ids') {
                    if (!idx.column_ids.every((x) => x && typeof x === 'object'))
                        throw new Error(`[${idxDisplayName}] The system "column_ids" property must be a list of objects`);
                    idx.column_ids = idx.column_ids.map((_colDef) => {
                        const colDef = tblCols.find((colDef) => colDef.id === _colDef.id);
                        if (!colDef) throw new Error(`[${idxDisplayName}] Unknown column: ${_colDef.name}`);
                        return colDef.id;
                    });
                }
            });

            if (!idx.name)
                idx.name = `${tblDef.name}__${idx.columns.join('_')}_idx`;

            const resultIdx = await sysIndexes.insert({
                relation_id: tblDef.id,
                name: idx.name,
                kind: idx.kind,
                method: idx.method,
                is_unique: idx.is_unique,
                column_ids: idx.column_ids,
                expression_ast: idx.expression_ast,
                predicate_ast: idx.predicate_ast,
            });

            resultIdxs.push(resultIdx);
        }

        const tblStorage = this.getTable(tblDef);
        const rowsBefore = tblStorage.getAll();

        for (const version of rowsBefore) {
            await tblStorage.addToIndexes(resultIdxs, version);
        }

        this.addUndo(() => {
            for (const version of rowsBefore) {
                tblStorage.removeFromIndexes(resultIdxs, version);
            }
        });

        return resultIdxs;
    }

    // ----------
    // Drop handlers
    // ----------

    async #dropNamespaces(nsDefs, cascade) {
        const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });
        const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });
        const sysDependencies = this.getTable({ namespace: 'sys', name: 'sys_dependencies' });

        for (const nsDef of nsDefs) {
            // Drop dependents
            const dependentObjs = sysDependencies.getAll().filter((dep) => {
                return dep.referenced_object_kind === 'namespace'
                    && dep.referenced_object_id === nsDef.id;
            });

            if (dependentObjs.length) {
                if (!cascade) throw new Error(`Namespace has dependent objects`);
                await this.#dropDependents(dependentObjs, cascade);
            }

            // Drop tables
            const tables = sysTables.get({ namespace_id: nsDef.id }, { using: 'sys_relations__namespace_id_idx', multiple: true });

            if (tables.length && !cascade)
                throw new Error(`Namespace ${nsDef.name} is not empty`);

            await this.#dropRelations(tables, cascade);

            await sysNs.delete(nsDef);
            await this.#clearDependencies('namespace', nsDef.id);
        }
    }

    async #dropRelations(tblDefs, cascade = false) {
        const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const sysConstraints = this.getTable({ namespace: 'sys', name: 'sys_constraints' });
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });
        const sysDependencies = this.getTable({ namespace: 'sys', name: 'sys_dependencies' });

        for (const tblDef of tblDefs) {
            // Drop dependents
            const dependentObjs = sysDependencies.getAll().filter((dep) => {
                return dep.referenced_object_kind === 'relation'
                    && dep.referenced_object_id === tblDef.id;
            });

            if (dependentObjs.length) {
                if (!cascade) throw new Error(`Table has dependent objects`);
                await this.#dropDependents(dependentObjs, cascade);
            }

            // Drop indexes
            const tblIdxs = sysIndexes.get({ relation_id: tblDef.id }, { using: 'sys_indexes__relation_id_idx', multiple: true });
            if (tblIdxs.length) {
                if (!cascade) throw new Error(`Table ${tblDef.name} has indexes`);
                await this.#dropIndexes(tblIdxs, cascade);
            }

            // Drop constraints
            const tblCons = sysConstraints.get({ relation_id: tblDef.id }, { using: 'sys_constraints__relation_id_idx', multiple: true });
            if (tblCons.length) await this.#dropConstraints(tblCons, cascade);

            // Drop columns
            const tblCols = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
            if (tblCols.length) await this.#dropColumns(tblCols, cascade);

            await sysTables.delete(tblDef);
            await this.#clearDependencies('relation', tblDef.id);
        }
    }

    async #dropColumns(columns, cascade = false) {
        const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
        const sysConstraints = this.getTable({ namespace: 'sys', name: 'sys_constraints' });
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });
        const sysDependencies = this.getTable({ namespace: 'sys', name: 'sys_dependencies' });

        for (const col of columns) {
            // Drop dependents
            const dependentObjs = sysDependencies.getAll().filter((dep) => {
                return dep.referenced_object_kind === 'column'
                    && dep.referenced_object_id === col.id;
            });

            if (dependentObjs.length) {
                if (!cascade) throw new Error(`Column has dependent objects`);
                await this.#dropDependents(dependentObjs, cascade);
            }

            // Drop referencing constraints
            const referencingCons = sysConstraints.getAll().filter((con) => {
                return con.column_ids?.includes?.(col.id)
                    || con.fk_target_column_ids?.includes?.(col.id);
            });

            if (referencingCons.length) {
                if (!cascade) throw new Error(`Column has dependent objects`);
                await this.#dropConstraints(referencingCons, cascade);
            }

            // Drop referencing indexes
            const referencingIdxs = sysIndexes.getAll().filter((idx) => {
                return idx.column_ids?.includes?.(col.id);
            });

            if (referencingIdxs.length) {
                if (!cascade) throw new Error(`Column has dependent objects`);
                await this.#dropIndexes(referencingIdxs, cascade);
            }

            // Drop
            await sysColumns.delete(col);
            await this.#clearDependencies('column', col.id);
        }
    }

    async #dropConstraints(constraints, cascade = false) {
        const sysConstraints = this.getTable({ namespace: 'sys', name: 'sys_constraints' });
        const sysDependencies = this.getTable({ namespace: 'sys', name: 'sys_dependencies' });

        for (const con of constraints) {
            // Drop dependents
            const dependentObjs = sysDependencies.getAll().filter((dep) => {
                return dep.referenced_object_kind === 'constraint'
                    && dep.referenced_object_id === con.id;
            });

            if (dependentObjs.length) {
                const implicitDependents = dependentObjs.every((dep) => dep.dependency_tag === 'constraint_backing_index');
                if (!cascade && !implicitDependents) throw new Error(`Constraint has dependent objects`);
                await this.#dropDependents(dependentObjs, cascade);
            }

            // Drop
            await sysConstraints.delete(con);
            await this.#clearDependencies('constraint', con.id);
        }
    }

    async #dropIndexes(indexes, cascade = false) {
        const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });
        const sysDependencies = this.getTable({ namespace: 'sys', name: 'sys_dependencies' });

        for (const idx of indexes) {
            // Drop dependents
            const dependentObjs = sysDependencies.getAll().filter((dep) => {
                return dep.referenced_object_kind === 'index'
                    && dep.referenced_object_id === idx.id;
            });

            if (dependentObjs.length) {
                if (!cascade) throw new Error(`Index has dependent objects`);
                await this.#dropDependents(dependentObjs, cascade);
            }

            // Drop
            await sysIndexes.delete(idx);
            await this.#clearDependencies('index', idx.id);
        }
    }

    async #dropDependents(dependents, cascade = false) {
        for (const dep of dependents) {
            if (dep.dependent_object_kind === 'namespace') {
                await this.#dropNamespaces([{ id: dep.dependent_object_id }], cascade);
            } else if (dep.dependent_object_kind === 'relation') {
                await this.#dropRelations([{ id: dep.dependent_object_id }], cascade);
            } else if (dep.dependent_object_kind === 'column') {
                await this.#dropColumns([{ id: dep.dependent_object_id }], cascade);
            } else if (dep.dependent_object_kind === 'constraint') {
                await this.#dropConstraints([{ id: dep.dependent_object_id }], cascade);
            } else if (dep.dependent_object_kind === 'index') {
                await this.#dropIndexes([{ id: dep.dependent_object_id }], cascade);
            }
        }
    }

    async #clearDependencies(objectKind, objectId) {
        const sysDependencies = this.getTable({ namespace: 'sys', name: 'sys_dependencies' });
        const matching = sysDependencies.getAll().filter((dep) => (
            dep.dependent_object_kind === objectKind && dep.dependent_object_id === objectId
        ) || (
                dep.referenced_object_kind === objectKind && dep.referenced_object_id === objectId
            ));
        for (const dep of matching) {
            if (sysDependencies.exists(dep)) await sysDependencies.delete(dep);
        }
    }

    async #validateConstraintsOnExistingRows(tblDef, constraints) {
        const tableStorage = this.getTable(tblDef);
        const rows = tableStorage.getAll();
        for (const constraint of constraints) {
            if (constraint.kind === 'PRIMARY KEY' || constraint.kind === 'UNIQUE') {
                const seen = new Set;
                for (const row of rows) {
                    const key = JSON.stringify(constraint.columns.map((col) => row[col] ?? ''));
                    if (constraint.kind === 'PRIMARY KEY' && constraint.columns.some((col) => row[col] === null || row[col] === undefined)) {
                        throw new Error(`[${constraint.name || constraint.kind}] Existing rows violate PRIMARY KEY nullability`);
                    }
                    if (seen.has(key)) throw new Error(`[${constraint.name || constraint.kind}] Existing rows violate uniqueness`);
                    seen.add(key);
                }
            } else if (constraint.kind === 'FOREIGN KEY') {
                const target = this.getTable({ namespace: constraint.target_namespace || tblDef.namespace_id.name, name: constraint.target_relation });
                for (const row of rows) {
                    const where = {};
                    const sourceColumns = constraint.columns || [];
                    const targetColumns = constraint.target_columns || [];
                    if (sourceColumns.every((col) => row[col] === null || row[col] === undefined)) continue;
                    targetColumns.forEach((col, i) => { where[col] = row[sourceColumns[i]]; });
                    if (!target.get(where)) throw new Error(`[${constraint.name || constraint.kind}] Existing rows violate foreign key`);
                }
            } else if (constraint.kind === 'CHECK' && constraint.ck_expression_ast) {
                const exprNode = registry.Expr.fromJSON(constraint.ck_expression_ast, { dialect: this.#engine.dialect, assert: true });
                for (const row of rows) {
                    const result = await this.#exprEngine.evaluateToScalar(exprNode, { [tblDef.name]: row });
                    if (result === false) {
                        throw new Error(`[${constraint.name || constraint.kind}] Existing rows violate check constraint`);
                    }
                }
            }
        }
    }

    async #validateIndexesOnExistingRows(tblDef, indexes) {
        const tableStorage = this.getTable(tblDef);
        const rows = tableStorage.getAll();
        for (const index of indexes) {
            if (!index.is_unique || index.kind !== 'column') continue;
            const seen = new Set;
            for (const row of rows) {
                const key = JSON.stringify(index.columns.map((col) => row[col] ?? ''));
                if (seen.has(key)) throw new Error(`[${index.name || 'INDEX'}] Existing rows violate uniqueness`);
                seen.add(key);
            }
        }
    }

    #nextVersion(tblDef, bumpLevel) {
        const record = this.#relationVersionBumps.get(tblDef.id) || {
            base: {
                version_major: tblDef.version_major,
                version_minor: tblDef.version_minor,
                version_patch: tblDef.version_patch,
            },
            level: 0,
        };
        record.level = Math.max(record.level, bumpLevel);
        this.#relationVersionBumps.set(tblDef.id, record);

        if (record.level >= 3) {
            return {
                version_major: record.base.version_major + 1,
                version_minor: 0,
                version_patch: 0,
            };
        }
        if (record.level === 2) {
            return {
                version_major: record.base.version_major,
                version_minor: record.base.version_minor + 1,
                version_patch: 0,
            };
        }
        return {
            version_major: record.base.version_major,
            version_minor: record.base.version_minor,
            version_patch: record.base.version_patch + 1,
        };
    }

    async #rewriteRelationRows(tblDef, transformRow) {
        const tableStorage = this.getTable(tblDef);
        const rows = tableStorage.getAll();
        for (const row of rows) {
            const nextRow = transformRow({ ...row });
            await tableStorage.update(row, nextRow, { systemTag: SYSTEM_TAG });
        }
    }

    async #assertNoNulls(tblDef, columnName) {
        const tableStorage = this.getTable(tblDef);
        const rows = tableStorage.getAll();
        const hasNulls = rows.some((row) => row[columnName] === null || row[columnName] === undefined);
        if (hasNulls) {
            throw new Error(`Column ${JSON.stringify(columnName)} contains nulls and cannot be set NOT NULL`);
        }
    }

    #prepareViewRowForStorage(viewDef, row) {
        if (viewDef.persistence !== 'realtime') return { ...row };
        if ('__id' in row) return { ...row };

        const stableKey = JSON.stringify(
            Object.keys(row).sort().map((key) => [key, row[key]])
        );
        return { __id: stableKey, ...row };
    }
}
