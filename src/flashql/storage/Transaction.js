import { SQLParser } from '../../lang/SQLParser.js';
import { ConflictError } from '../errors/ConflictError.js';
import { bootstrapCatalog } from './bootstrap/catalog.bootstrap.js';
import { TableStorage } from './TableStorage.js';
import { SYSTEM_TAG } from './TableStorage.js';
import { satisfiesVersionSpec, formatVersion } from './versionSpec.js';
import { ExprEngine } from '../eval/ExprEngine.js';
import { registry } from '../../lang/registry.js';

export class Transaction {

    #engine;
    #parentTx;
    #id;
    #targetState;
    #targetStateCaller;
    #snapshot;
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
    get parentTx() { return this.#parentTx; }
    get rootTx() { return this.#parentTx?.rootTx || this; }
    get id() { return this.#id; }
    get snapshot() { return this.#snapshot; }

    get _strategy() { return this.#strategy; }
    get _catalog() { return this.#catalog; }
    get _targetState() { return this.#targetState; }
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

    constructor({ engine, id, snapshot, strategy, meta = null, parentTx = null }) {
        this.#engine = engine;
        this.#id = id;
        this.#parentTx = parentTx;
        this.#snapshot = snapshot;
        this.#strategy = strategy;
        this.#meta = meta && typeof meta === 'object' ? { ...meta } : meta;

        if (parentTx) {
            parentTx.addFinallizer(async () => {
                // Parent was committed
                if (this.#targetState === 'abort') return;
                // Implicitly commit
                await this.#engine.commit(this);
            });
            parentTx.addUndo(async () => {
                // Parent was aborted
                if (this.#targetState === 'abort') return;
                // Implicitly abort
                await this.#engine.abort(this);
            });
        }

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
        if (this.#targetState) {
            if (this.#targetState !== 'commit')
                throw new Error(`Invalid transaction state; already aborted \n${this.#targetStateCaller}`);
            return;
        }

        let parentMeta;

        // Wait for parent if still active
        if (this.#parentTx && (parentMeta = this.#engine.txMeta(this.#parentTx.id))?.state === 'active') {
            this.#targetState = 'commit';
            this.#targetStateCaller = captureStackTrace();
            return;
        }

        // Throw on parent haven been aborted
        if (parentMeta?.state === 'aborted')
            throw new Error('Cannot commit as parent transaction is aborted');

        await this.#engine.commit(this);

        this.#targetState = 'commit';
        this.#targetStateCaller = captureStackTrace();
    }

    async abort() {
        if (this.#targetState) {
            if (this.#targetState !== 'abort')
                throw new Error(`Invalid transaction state; already committed \n${this.#targetStateCaller}`);
            return;
        }

        await this.#engine.abort(this);

        this.#targetState = 'abort';
        this.#targetStateCaller = captureStackTrace();
    }

    // -------

    nextSequence(seqId) {
        this.#affectedSequences.add(seqId);
        return this.#engine._nextSequence(seqId);
    }

    recordChange(change) {
        if (this.#engine.readOnly && !this.#engine._isHydrating) {
            throw new Error('StorageEngine is read-only');
        }
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
        view_opts_default_replication_origin = null,
        engine_attrs = null,
        ...unexpected
    }, { ifNotExists = false } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        const resolvedNsDef = await this.#resolve_namespaceDef({}, {
            name,
            kind,
            owner,
            view_opts_default_replication_origin,
            engine_attrs
        }, {
            isCreate: true,
            ifNotExists
        });

        // Already exists but ifNotExists set?
        if (!Object.keys(resolvedNsDef).length) return null;

        const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });
        return await sysNs.insert(resolvedNsDef);
    }

    async #resolve_namespaceDef(nsDef, input, { isCreate = false, ifNotExists = false } = {}) {
        if (![undefined, null].includes(input.kind)) {
            if (!['schema'].includes(input.kind))
                throw new Error(`Invalid namespace kind setting ${input.kind}`);
            nsDef.kind = input.kind;
        } else if (isCreate) nsDef.kind = 'schema';

        if (![undefined, null].includes(input.name) && input.name !== nsDef.name || isCreate) {
            if (!/^[a-zA-Z_]/.test(input.name))
                throw new Error(`Namespace name must start with a letter or underscore`);
            const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });
            const existing = sysNs.get({ name: input.name }, { using: 'sys_namespaces__name_idx' });
            if (existing) {
                if (ifNotExists) return {};
                throw new ConflictError(`Namespace ${JSON.stringify(input.name)} already exists`, existing);
            }
            nsDef.name = input.name;
        }

        if (![undefined, null].includes(input.owner)) {
            if (!/^[a-zA-Z_]/.test(input.owner))
                throw new Error(`Namespace owner must start with a letter or underscore`);
            nsDef.owner = input.owner;
        } else if (isCreate) nsDef.owner = null;

        if (input.view_opts_default_replication_origin !== undefined) {
            // Can be reset to null
            if (input.view_opts_default_replication_origin !== null) {
                if (typeof input.view_opts_default_replication_origin !== 'string')
                    throw new SyntaxError(`View default replication origin type must be string`);
            }
            nsDef.view_opts_default_replication_origin = input.view_opts_default_replication_origin;
        } else if (isCreate) nsDef.view_opts_default_replication_origin = null;

        if (input.engine_attrs !== undefined) {
            // Can be reset to null
            if (input.engine_attrs !== null) {
                if (typeof input.engine_attrs !== 'object')
                    throw new SyntaxError(`engine_attrs must be an object`);
                const attrKeys = Object.keys(input.engine_attrs);
                if (attrKeys.length) throw new SyntaxError(`Unexpected attributes: ${attrKeys.map((k) => `engine_attrs.${k}`).join(', ')}`);
            }
            nsDef.engine_attrs = input.engine_attrs;
        } else if (isCreate) nsDef.engine_attrs = null;

        return nsDef;
    }

    async alterNamespace({ name }, {
        // Note that all values' default have to be "undefined"
        name: newName,
        owner,
        view_opts_default_replication_origin,
        // Rest
        engine_attrs,
        // actions
        actions = [],
        ...unexpected
    }, { ifExists = false } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        const nsDef = this.showNamespace({ name }, { ifExists });
        if (!nsDef) return null;

        const resolvedNsDef = await this.#resolve_namespaceDef({ ...nsDef }, {
            name: newName,
            owner,
            view_opts_default_replication_origin,
            engine_attrs
        });

        const sysNs = this.getTable({ namespace: 'sys', name: 'sys_namespaces' });
        return await sysNs.update(nsDef, resolvedNsDef);
    }

    async dropNamespace({ name }, { ifExists = false, cascade = false } = {}) {
        const nsDef = this.showNamespace({ name }, { ifExists });
        if (nsDef) return await this.#dropNamespaces([nsDef], cascade);
        return null;
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
        const { namespace, kind, persistence, replication_mode } = typeof filter === 'object' && filter ? filter : {};

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

        if (persistence) {
            const persistenceList = [].concat(persistence);
            tblDefs = tblDefs.filter((tblDef) => persistenceList.includes(tblDef.persistence));
        }

        if (replication_mode) {
            const replicationModeList = [].concat(replication_mode);
            tblDefs = tblDefs.filter((tblDef) => replicationModeList.includes(tblDef.view_opts_replication_mode));
        }

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
        persistence = 'default',
        source_expr = null,
        source_expr_ast = null,
        view_opts_replication_mode = null,
        view_opts_replication_origin = null,
        view_opts_replication_attrs = null,
        engine_attrs = null,
        columns = [],
        constraints = [],
        indexes = [],
        ...unexpected
    }, { ifNotExists = false } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        const {
            namespace_id: nsDef,
            columns: resolveColumns,
            constraints: resolvedConstraints,
            indexes: resolvedIndexes,
            structuralChanges,
            ...resolvedTblDef
        } = await this.#resolve_tableDef({}, {
            namespace,
            name,
            kind,
            persistence,
            source_expr,
            source_expr_ast,
            view_opts_replication_mode,
            view_opts_replication_origin,
            view_opts_replication_attrs,
            engine_attrs,
            columns,
            constraints,
            indexes
        }, {
            isCreate: true,
            ifNotExists
        });

        // Already exists but ifNotExists set?
        if (!Object.keys(resolvedTblDef).length) return null;

        const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });
        const resultTbl = await sysTables.insert({
            namespace_id: nsDef.id,
            ...resolvedTblDef,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
        }, { systemTag: SYSTEM_TAG });

        let resultCols = [];
        if (resolveColumns.length) resultCols = await this.#insertColumns(resultTbl, resolveColumns);
        if (resolvedConstraints.length) await this.#insertConstraints(resultTbl, resolvedConstraints, resultCols);
        if (resolvedIndexes?.length) await this.#insertIndexes(resultTbl, resolvedIndexes, resultCols);

        return resultTbl;
    }

    async #resolve_tableDef(tblDef, input, { isCreate = false, ifNotExists = false } = {}) {
        if (![null, undefined].includes(input.kind)) {
            if (!['table', 'view'].includes(input.kind))
                throw new Error(`Invalid relation kind setting ${input.kind}`);
            tblDef.kind = input.kind;
        } else if (isCreate) tblDef.kind = 'table';

        if (input.namespace || isCreate) {
            tblDef.namespace_id = this.showNamespace({ name: input.namespace });
        }

        if (![null, undefined].includes(input.name) && input.name !== tblDef.name || isCreate) {
            if (!/^[a-zA-Z_]/.test(input.name))
                throw new Error(`Relation name must start with a letter or underscore`);
            const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });
            const existing = sysTables.get({ namespace_id: tblDef.namespace_id.id, name: input.name }, { using: 'sys_relations__namespace_id_name_idx' });
            if (existing) {
                if (ifNotExists) return {};
                throw new ConflictError(`Relation ${JSON.stringify(nsDef.name)}.${JSON.stringify(input.name)} already exists`, existing);
            }
            tblDef.name = input.name;
        }

        if (![null, undefined].includes(input.persistence)) {
            if (!['default', 'temporary'].includes(input.persistence))
                throw new Error(`Invalid persistence setting ${input.persistence}`);
            tblDef.persistence = input.persistence;
        } else if (isCreate) tblDef.persistence = 'default';

        if (input.engine_attrs !== undefined) {
            // Can be reset to null
            if (input.engine_attrs !== null) {
                if (typeof input.engine_attrs !== 'object')
                    throw new SyntaxError(`engine_attrs must be an object`);
                const attrKeys = Object.keys(input.engine_attrs);
                if (attrKeys.length) throw new SyntaxError(`Unexpected attributes: ${attrKeys.map((k) => `engine_attrs.${k}`).join(', ')}`);
            }
            tblDef.engine_attrs = input.engine_attrs;
        } else if (isCreate) tblDef.engine_attrs = null;

        const structuralChanges = {};

        if (tblDef.kind === 'table') {
            if (![null, undefined].includes(input.view_opts_replication_mode))
                throw new Error(`Unexpected property "view_opts_replication_mode" for a non-view relation`);
            if (![null, undefined].includes(input.view_opts_replication_origin))
                throw new Error(`Unexpected property "view_opts_replication_origin" for a non-view relation`);
            if (![null, undefined].includes(input.view_opts_replication_attrs))
                throw new Error(`Unexpected property "view_opts_replication_attrs" for a non-view relation`);
        } else /* view */ {
            if (input.view_opts_replication_mode !== undefined) {
                // Can be reset to 'none'
                if (input.view_opts_replication_mode !== null) {
                    const modes = ['materialized', 'realtime', 'none'];
                    if (!modes.includes(input.view_opts_replication_mode))
                        throw new SyntaxError(`View replication mode must be one of ${modes.join(', ')}. Got ${input.view_opts_replication_mode}`);
                }
                if (tblDef.view_opts_replication_mode !== (input.view_opts_replication_mode || 'none')) {
                    tblDef.view_opts_replication_mode = input.view_opts_replication_mode || 'none';
                    structuralChanges.view_opts_replication_mode = true;
                }
            } else if (isCreate) tblDef.view_opts_replication_mode = 'none';

            if (input.view_opts_replication_origin !== undefined) {
                // Can be reset to null
                if (input.view_opts_replication_origin !== null) {
                    if (typeof input.view_opts_replication_origin !== 'string')
                        throw new SyntaxError(`View replication origin type must be string. Got type ${typeof input.view_opts_replication_origin}`);
                }
                if (tblDef.view_opts_replication_origin !== input.view_opts_replication_origin) {
                    tblDef.view_opts_replication_origin = input.view_opts_replication_origin;
                    structuralChanges.view_opts_replication_origin = true;
                }
            } else if (isCreate) tblDef.view_opts_replication_origin = null;

            if (input.view_opts_replication_attrs !== undefined) {
                // Can be reset to null
                if (input.view_opts_replication_attrs !== null) {
                    if (typeof input.view_opts_replication_attrs !== 'object')
                        throw new SyntaxError(`View replication attrs type must be object. Got type ${typeof input.view_opts_replication_attrs}`);

                    if (this.#engine._viewIsPureFederation(tblDef)) {
                        for (const [k, v] of Object.entries(input.view_opts_replication_attrs)) {
                            if (k === 'join_pushdown_size') {
                                if (!/^\d+$/.test(v))
                                    throw new SyntaxError(`view_opts_replication_attrs.${k} must be numeric; recieved ${v}`);
                                tblDef.view_opts_replication_attrs = { ...(tblDef.view_opts_replication_attrs || {}), [k]: Number(v) }
                            } else if (k === 'join_memoization') {
                                if (!/^(true|false)$/i.test(v + ''))
                                    throw new SyntaxError(`view_opts_replication_attrs.${k} must be true or false; recieved ${v}`);
                                tblDef.view_opts_replication_attrs = { ...(tblDef.view_opts_replication_attrs || {}), [k]: Boolean(v) }
                            } else {
                                throw new SyntaxError(`Unexpected attribute: view_opts_replication_attrs.${k}`);
                            }
                        }
                    } else {
                        const attrKeys = Object.keys(input.view_opts_replication_attrs);
                        if (attrKeys.length) throw new SyntaxError(`Unexpected attributes: ${attrKeys.map((k) => `view_opts_replication_attrs.${k}`).join(', ')}`);
                        tblDef.view_opts_replication_attrs = { ...(tblDef.view_opts_replication_attrs || {}), ...input.view_opts_replication_attrs };
                    }
                } else {
                    tblDef.view_opts_replication_attrs = input.view_opts_replication_attrs;
                }
            } else if (structuralChanges.view_opts_replication_mode && !this.#engine._viewIsPureFederation(tblDef)) {
                tblDef.view_opts_replication_attrs = null;
            } else if (isCreate) tblDef.view_opts_replication_attrs = null;
        }

        let reservedColumnConflict;
        if (reservedColumnConflict = input.columns?.find((col) => col.name.startsWith('__'))) {
            throw new Error(`[${reservedColumnConflict}] Reserved column namespace "__*"`);
        }

        // --- Expression
        let sourceExprNode;

        if (![null, undefined].includes(input.source_expr)) {
            if (!['string', 'object'].includes(typeof input.source_expr))
                throw new Error(`"source_expr" must be a string or an object`);
            if (input.source_expr_ast) throw new Error(`Only one of "source_expr" or "source_expr_ast" may be specified`);

            sourceExprNode = await this.#parser.parse(input.source_expr, { dialect: this.#engine.dialect });
            tblDef.source_expr_ast = sourceExprNode.jsonfy();
            structuralChanges.source_expr_ast = true;
        } else {
            const effectiveSourceExprAst = input.source_expr_ast || tblDef.source_expr_ast;
            if (![null, undefined].includes(input.source_expr_ast) || !isCreate && Object.keys(structuralChanges).length) {
                if (typeof effectiveSourceExprAst.nodeName === 'string') {
                    tblDef.source_expr_ast = effectiveSourceExprAst;
                    sourceExprNode = await this.#parser.parse(effectiveSourceExprAst);

                    structuralChanges.source_expr_ast = true;
                } else if (input.source_expr_ast.NODE_NAME) {
                    sourceExprNode = input.source_expr_ast;
                    tblDef.source_expr_ast = sourceExprNode.jsonfy();

                    structuralChanges.source_expr_ast = true;
                } else throw new Error(`The system "source_expr_ast" property must be a valid AST`);
            } else if (isCreate) {
                if (tblDef.kind === 'view') {
                    throw new Error(`source_expr must be specified for a view`);
                }
                tblDef.columns = input.columns || [];
                tblDef.constraints = input.constraints || [];
                tblDef.indexes = input.indexes || [];
            }
        }

        if (sourceExprNode) {
            for (const col of input.columns || []) {
                for (const k in col) {
                    if (k !== 'name') throw new TypeError(`Unexpected ${k} attribute on column alias ${col.name}`);
                }
            }
            if (input.constraints?.length) throw new TypeError(`Unexpected constraints list alongside a source-query-based relation`);
            if (input.indexes?.length) throw new TypeError(`Unexpected constraints list alongside a source-query-based relation`);

            let derivedColumns, derivedConstraints = [];

            const schemaInference = await this.#engine.getSourceResolver(tblDef);
            const resolvedQuery = await schemaInference.resolveQuery(sourceExprNode, { tx: schemaInference.storageEngine === this.#engine ? this : null });

            const selectNode = sourceExprNode instanceof registry.CTE
                ? sourceExprNode.body()
                : sourceExprNode;

            if (this.#engine._viewSourceExprIsPureRef(tblDef)) {
                const [tblSchema] = resolvedQuery.originSchemas();
                ({ columns: derivedColumns, constraints: derivedConstraints } = this.#parser.tableAST_to_tableDef(tblSchema));
            } else {
                if (!(selectNode instanceof registry.SelectStmt))
                    throw new SyntaxError(`source_expr must be a valid SELECT statement or a CTE of such`);
                derivedColumns = resolvedQuery.resultSchema().entries().map((col) => this.#parser.columnAST_to_columnDef(col));
            }

            if (input.columns?.length) {
                if (input.columns.length !== derivedColumns.length)
                    throw new Error(`View column list has ${input.columns.length} column(s), but query returns ${derivedColumns.length}`);

                tblDef.columns = derivedColumns.map((col, i) => {
                    if (typeof input.columns[i].name !== 'string') throw new TypeError(`Input column #${i} is missing a name property or property is invalid`);
                    return { ...col, name: input.columns[i].name };
                });
            } else {
                tblDef.columns = derivedColumns;
            }

            tblDef.constraints = derivedConstraints;
        }

        if ((isCreate || Object.keys(structuralChanges).length) && !tblDef.constraints?.find((con) => con.kind === 'PRIMARY KEY')) {
            if (tblDef.kind === 'view' && !this.#engine._viewSourceExprIsPureRef(tblDef) && tblDef.view_opts_replication_mode === 'realtime') {
                tblDef.columns = [{ name: '__id', type: 'TEXT', not_null: true, engine_attrs: { is_system_column: true } }].concat(tblDef.columns);
                tblDef.constraints = [{ kind: 'PRIMARY KEY', columns: ['__id'] }].concat(tblDef.constraints);
            } else if (!(tblDef.kind === 'view' && this.#engine._viewIsPureFederation(tblDef))) {
                tblDef.columns = [{ name: '__id', type: 'INT', is_generated: true, generation_rule: 'by_default', engine_attrs: { is_system_column: true } }].concat(tblDef.columns);
                tblDef.constraints = [{ kind: 'PRIMARY KEY', columns: ['__id'] }].concat(tblDef.constraints);
            }
        }

        return { ...tblDef, structuralChanges };
    }

    async alterTable({
        namespace,
        name
    }, {
        // Note that all values' default have to be "undefined"
        namespace: newNamespace,
        name: newName,
        source_expr,
        source_expr_ast,
        columns,
        // View specific - tho not supported from the AST path
        view_opts_replication_mode,
        view_opts_replication_origin,
        view_opts_replication_attrs,
        // Rest
        engine_attrs,
        // actions
        actions = [],
        ...unexpected
    }, {
        assertIsView = false,
        ifExists = false,
    } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        if (!source_expr && !source_expr_ast && columns?.length)
            throw new Error(`Unexpected column aliases when source expr is not provided`);

        const tblDef = this.showTable({ namespace, name }, { assertIsView, ifExists });
        if (!tblDef) return null;

        if (tblDef.kind === 'view' && actions?.length)
            throw new Error(`Unexpected actions list for a view`);

        const {
            namespace_id: nsDef,
            columns: resolveColumns,
            constraints: resolvedConstraints,
            structuralChanges,
            ...resolvedTblDef
        } = await this.#resolve_tableDef({ ...tblDef }, {
            namespace: newNamespace,
            name: newName,
            source_expr,
            source_expr_ast,
            view_opts_replication_mode,
            view_opts_replication_origin,
            view_opts_replication_attrs,
            engine_attrs,
            columns
        });

        let versionBump = 0;

        // Identity change
        if (nsDef.name !== tblDef.namespace_id.name
            || resolvedTblDef.name !== tblDef.name) {
            versionBump = Math.max(versionBump, 3);
        }

        // source_expr change
        if (!matches(resolvedTblDef.source_expr_ast, tblDef.source_expr_ast)) {
            versionBump = Math.max(versionBump, 3);
        } else if (Object.keys(structuralChanges).length) {
            // replication_mode or replication_origin change
            versionBump = Math.max(versionBump, 2);
        }

        // replication_attrs change
        if (!matches(resolvedTblDef.view_opts_replication_attrs, tblDef.view_opts_replication_attrs)) {
            versionBump = Math.max(versionBump, 1);
        }

        // engine_attrs change
        if (!matches(resolvedTblDef.engine_attrs, tblDef.engine_attrs)) {
            versionBump = Math.max(versionBump, 1);
        }

        if (Object.keys(structuralChanges).length) {
            if (tblDef.kind === 'view') {
                await this.resetView({ namespace: tblDef.namespace_id.name, name: tblDef.name }, { syncForget: false });
            }
            const sysColumns = this.getTable({ namespace: 'sys', name: 'sys_columns' });
            const sysConstraints = this.getTable({ namespace: 'sys', name: 'sys_constraints' });
            const sysIndexes = this.getTable({ namespace: 'sys', name: 'sys_indexes' });

            const existingColumns = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
            const existingConstraints = sysConstraints.get({ relation_id: tblDef.id }, { using: 'sys_constraints__relation_id_idx', multiple: true });
            const existingIndexes = sysIndexes.get({ relation_id: tblDef.id }, { using: 'sys_indexes__relation_id_idx', multiple: true });
            // Drop all existing columns and constraints and indexes
            await this.#dropColumns(existingColumns, true);
            await this.#dropConstraints(existingConstraints, true);
            await this.#dropConstraints(existingIndexes, true);
            // Add new derived columns
            let resultCols = [];
            if (resolveColumns.length) resultCols = await this.#insertColumns(tblDef, resolveColumns);
            if (resolvedConstraints.length) await this.#insertConstraints(tblDef, resolvedConstraints, resultCols);
        }

        for (const action of actions || []) {
            if (action.type === 'add:column') {
                await this.#addColumnsToRelation(tblDef, [action.column]);
                versionBump = Math.max(versionBump, 2);
            } else if (action.type === 'add:constraint') {
                await this.#addConstraintsToRelation(tblDef, [action.constraint]);
                versionBump = Math.max(versionBump, 2);
            } else if (action.type === 'add:index') {
                await this.#addIndexesToRelation(tblDef, [action.index]);
            } else if (action.type === 'alter:column') {
                await this.#alterColumnInRelation(tblDef, action.name, action);
                versionBump = Math.max(versionBump, 1);
            } else if (action.type === 'rename:column') {
                await this.#renameColumnInRelation(tblDef, action.oldName, action.name);
                versionBump = Math.max(versionBump, 2);
            } else if (action.type === 'rename:index') {
                await this.#renameIndexInRelation(tblDef, action.oldName, action.name);
                versionBump = Math.max(versionBump, 2);
            } else if (action.type === 'drop:column') {
                await this.#dropColumnsFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
                versionBump = Math.max(versionBump, 2);
            } else if (action.type === 'drop:constraint') {
                await this.#dropConstraintsFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
                versionBump = Math.max(versionBump, 2);
            } else if (action.type === 'drop:index') {
                await this.#dropIndexesFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
                versionBump = Math.max(versionBump, 2);
            } else {
                throw new Error(`Unsupported ALTER TABLE action ${JSON.stringify(action.type)}`);
            }
        }

        if (versionBump) {
            Object.assign(resolvedTblDef, this.#nextVersion(tblDef, versionBump));
            const sysTables = this.getTable({ namespace: 'sys', name: 'sys_relations' });
            return await sysTables.update(tblDef, {
                namespace_id: nsDef.id,
                ...resolvedTblDef
            }, { systemTag: SYSTEM_TAG });
        }

        return tblDef;
    }

    async dropTable({ namespace, name }, { assertIsView = false, assertPersistence = null, ifExists = false, cascade = false } = {}) {
        const tblDef = this.showTable({ namespace, name }, { ifExists, assertIsView });

        if (assertPersistence && tblDef && tblDef.persistence !== assertPersistence)
            throw new Error(`The referenced relation ${JSON.stringify(namespace)}.${JSON.stringify(name)} has a different persitence mode "${tblDef.persistence}" than the implied "${assertPersistence}"`);

        if (tblDef) await this.#dropRelations([tblDef], cascade);
        return tblDef;
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
        const { namespace, persistence, replication_mode } = typeof filter === 'object' && filter ? filter : {};

        if (filterFn) {
            return this.listTables((tblDef) => {
                if (tblDef.kind !== 'view') return false;
                return filterFn(tblDef);
            }, { details });
        }

        return this.listTables({ namespace, kind: 'view', persistence, replication_mode }, { details });
    }

    showView({ namespace, namespace_id = null, name, id = null }, { schema = false, ifExists = false } = {}) {
        return this.showTable({ namespace, namespace_id, name, id }, { schema, ifExists, assertIsView: true });
    }

    async createView({
        replication_mode = null,
        replication_origin = null,
        replication_attrs = null,
        ...createPayload
    }, createOpts = {}) {

        const result = await this.createTable({
            view_opts_replication_mode: replication_mode,
            view_opts_replication_origin: replication_origin,
            view_opts_replication_attrs: replication_attrs,
            ...createPayload,
            kind: 'view' // Force
        }, createOpts);

        const syncResult = await this.#engine.sync.sync({ [createPayload.namespace]: createPayload.name }, { tx: this });
        if (syncResult.failed?.length) throw new Error(`View was created but sync failed with error: ${syncResult.failed[0].error}`);

        return result;
    }

    async alterView({ namespace, name }, {
        // Note that all values' default have to be "undefined"
        replication_mode,
        replication_origin,
        replication_attrs,
        ...alterPayload
    }, alterOpts = {}) {
        await this.#engine.sync.forget({ [namespace]: name }, { tx: this });

        const result = await this.alterTable({ namespace, name }, {
            view_opts_replication_mode: replication_mode,
            view_opts_replication_origin: replication_origin,
            view_opts_replication_attrs: replication_attrs,
            ...alterPayload
        }, { ...alterOpts, assertIsView: true });

        if (result) await this.#engine.sync.sync({ [alterPayload.namespace || namespace]: alterPayload.name || name }, { tx: this });
        return result;
    }

    async dropView({ namespace, name }, dropOpts) {
        const result = await this.dropTable({ namespace, name }, { ...dropOpts, assertIsView: true });
        if (result) await this.#engine.sync.forget({ [namespace]: name }, { tx: this });
        return result;
    }

    async resetView({ namespace, name }, { assertReplicationMode = null, syncForget = true } = {}) {
        const tableStorage = this.getTable({ namespace, name }, { assertIsView: true });

        if (assertReplicationMode && tableStorage.schema.view_opts_replication_mode !== assertReplicationMode)
            throw new Error(`The referenced view ${JSON.stringify(namespace)}.${JSON.stringify(name)} has a different replication mode "${tableStorage.schema.view_opts_replication_mode}" than the implied "${assertReplicationMode}"`);

        await tableStorage.truncate();
        if (syncForget) await this.#engine.sync.forget({ [namespace]: name }, { tx: this });
    }

    async refreshView({ namespace, name }, { assertReplicationMode = null } = {}) {
        const result = await this.resetView({ namespace, name }, { assertReplicationMode });
        await this.#engine.sync.sync({ [namespace]: name }, { forceSync: true, tx: this });
        return result;
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
        if (hasNulls)
            throw new Error(`Column ${JSON.stringify(columnName)} contains nulls and cannot be set NOT NULL`);
    }
}

function matches(a, b) {
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (const v of new Set(a.concat(b))) {
            if (!a.includes(v) || !b.includes(v)) return false;
        }
        return true;
    }

    if (typeof a === 'object') {
        a = a || {};
        b = b || {};
        for (const k of new Set(Object.keys(a).concat(Object.keys(a)))) {
            if (!matches(a[k], b[k])) return false;
        }
        return true;
    }

    return a === b;
}

function captureStackTrace() {
    try { throw new Error(''); } catch (e) {
        return e.stack.split('\n').slice(3).join('\n');
    }
}