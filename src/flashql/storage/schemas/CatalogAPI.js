import { registry } from '../../../lang/registry.js';
import { SQLParser } from '../../../lang/SQLParser.js';
import { ExprEngine } from '../../eval/ExprEngine.js';
import { bootstrapCatalog } from '../bootstrap/catalog.bootstrap.js';
import { satisfiesVersionSpec, formatVersion } from './versionSpec.js';
import { TableStorage } from '../TableStorage.js';
import { ViewStorage } from '../ViewStorage.js';
import { SYSTEM_TAG } from '../TableStorage.js';
import { NamespaceDDL } from './NamespaceDDL.js';
import { RelationDDL } from './RelationDDL.js';

export class CatalogAPI {

    #storageEngine;
    #tx;

    #parser;
    #exprEngine;

    #catalog;
    #sysCatalog;

    get storageEngine() { return this.#storageEngine; }
    get _catalog() { return this.#catalog; }

    constructor({ storageEngine }) {
        this.#storageEngine = storageEngine;
        this.#tx = this;

        this.#catalog = new Map([...this.#storageEngine._catalog].map(([relationId, tblGraphs]) => {
            return [relationId, { ...tblGraphs }]
        }));

        this.#parser = new SQLParser({ dialect: this.#storageEngine.dialect });
        this.#exprEngine = new ExprEngine(null, { dialect: this.#storageEngine.dialect });
    }

    recordChange(change) {
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

            const tableStorage = this.getRelation({ namespace, name });

            if (op === 'insert') {
                await tableStorage.insert(newRow, { systemTag: SYSTEM_TAG });
            } else if (op === 'update') {
                await tableStorage.update(oldRow, newRow, { systemTag: SYSTEM_TAG });
            } else if (op === 'delete') {
                await tableStorage.delete(oldRow, { systemTag: SYSTEM_TAG });
            } else {
                throw new Error(`Unknown op type: ${op}`);
            }
        }
    }

    getRelation({ ...selector }, { assertIsView = false } = {}) {
        const tblSchema = this.#showRelation({ ...selector }, { schema: true, assertIsView });
        const TableClass = tblSchema.kind === 'view'
            ? ViewStorage
            : TableStorage;
        return new TableClass(
            this.#tx,
            tblSchema,
            { dialect: this.#storageEngine.dialect }
        );
    }

    // -------

    #getSysCatalog(bootstrap = false) {
        if (bootstrap) return bootstrapCatalog;
        if (this.#sysCatalog) return this.#sysCatalog;

        const sysCatalog = new Map(['sys_namespaces', 'sys_relations', 'sys_types', 'sys_columns', 'sys_constraints', 'sys_indexes', 'sys_dependencies', 'sys_insync_jobs', 'sys_outsync_queue'].map(
            (n) => [n, this.getRelation({ namespace: 'sys', name: n })],
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

        const sysNs = this.getRelation({ namespace: 'sys', name: 'sys_namespaces' });
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

        const namespaceDDL = new NamespaceDDL(this);
        const resolvedNsDef = await namespaceDDL.apply({
            name,
            kind,
            owner,
            view_opts_default_replication_origin,
            engine_attrs
        }, { ifNotExists  });

        // Already exists but ifNotExists set?
        if (!Object.keys(resolvedNsDef).length) return null;

        const sysNs = this.getRelation({ namespace: 'sys', name: 'sys_namespaces' });
        return await sysNs.insert(resolvedNsDef, { systemTag: SYSTEM_TAG });
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

        const namespaceDDL = new NamespaceDDL(this, nsDef);
        const resolvedNsDef = await namespaceDDL.apply({
            name: newName,
            owner,
            view_opts_default_replication_origin,
            engine_attrs
        });

        const sysNs = this.getRelation({ namespace: 'sys', name: 'sys_namespaces' });
        const result = await sysNs.update(nsDef, resolvedNsDef, { systemTag: SYSTEM_TAG });

        // view_opts_default_replication_origin changed?
        if (view_opts_default_replication_origin !== undefined
            && view_opts_default_replication_origin !== nsDef.view_opts_default_replication_origin) {
            // Refresh all inheriting views

            const sysTables = this.getRelation({ namespace: 'sys', name: 'sys_relations' });
            const inheritingViews = sysTables.get({ namespace_id: nsDef.id }, { using: 'sys_relations__namespace_id_idx', multiple: true })
                .filter((tblDef) => tblDef.kind === 'view' && tblDef.view_opts_replication_origin === 'inherit');

            for (const inheritedView of inheritingViews) {
                await this.alterView(
                    { namespace: resolvedNsDef.name, name: inheritedView.name },
                    { replication_origin: 'inherit', source_expr_ast: inheritedView.source_expr_ast }
                );
            }
        }

        return result;
    }

    async dropNamespace({ name }, { ifExists = false, cascade = false } = {}) {
        const nsDef = this.showNamespace({ name }, { ifExists });
        if (nsDef) return await this.#dropNamespaces([nsDef], cascade);
        return null;
    }

    // ----------
    // Relations
    // ----------

    #listRelations(filter = null, { details = false } = {}) {
        if (typeof filter === 'boolean') {
            [details, filter] = [filter, null];
        }
        const filterFn = typeof filter === 'function' ? filter : null;
        const { namespace, kind, persistence, replication_mode } = typeof filter === 'object' && filter ? filter : {};

        const sysTables = this.getRelation({ namespace: 'sys', name: 'sys_relations' });

        let tblDefs;

        if (namespace) {
            const sysNs = this.getRelation({ namespace: 'sys', name: 'sys_namespaces' });

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

    #showRelation({ namespace, namespace_id = null, name, id = null, versionSpec = null }, { schema = false, ifExists = false, assertIsView = false } = {}) {
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

    async #createRelation({
        // Base
        namespace,
        name,
        kind,
        persistence = 'default',
        // Source-based relations
        source_expr = null,
        source_expr_ast = null,
        column_aliases = [],
        // Tables
        columns = [],
        constraints = [],
        indexes = [],
        // Views
        view_opts_replication_mode = null,
        view_opts_replication_origin = null,
        view_opts_replication_opts = null,
        // Either
        engine_attrs = null,
    }, { ifNotExists = false } = {}) {

        const relationDDL = new RelationDDL(this);

        const {
            namespace_id: nsDef,
            columns: resolveColumns,
            constraints: resolvedConstraints,
            indexes: resolvedIndexes,
            structuralChanges,
            ...resolvedTblDef
        } = await relationDDL.apply({
            namespace,
            name,
            kind,
            persistence,
            source_expr,
            source_expr_ast,
            column_aliases,
            columns,
            constraints,
            indexes,
            view_opts_replication_mode,
            view_opts_replication_origin,
            view_opts_replication_opts,
            engine_attrs,
        }, {
            isCreate: true,
            ifNotExists
        });

        // Already exists but ifNotExists set?
        if (!Object.keys(resolvedTblDef).length) return null;

        const sysTables = this.getRelation({ namespace: 'sys', name: 'sys_relations' });
        const resultTbl = await sysTables.insert({
            namespace_id: nsDef.id,
            ...resolvedTblDef,
        }, { systemTag: SYSTEM_TAG });

        let resultCols = [];
        if (resolveColumns.length) resultCols = await this.#insertColumns(resultTbl, resolveColumns);
        if (resolvedConstraints.length) await this.#insertConstraints(resultTbl, resolvedConstraints, resultCols);
        if (resolvedIndexes?.length) await this.#insertIndexes(resultTbl, resolvedIndexes, resultCols);

        return resultTbl;
    }

    async #alterRelation({
        namespace,
        name
    }, {
        // Base
        namespace: newNamespace,
        name: newName,
        // Source-based relations
        source_expr,
        source_expr_ast,
        column_aliases,
        // Tables
        actions = [],
        // Views
        view_opts_replication_mode,
        view_opts_replication_origin,
        view_opts_replication_opts,
        // Rest
        engine_attrs,
    }, {
        assertIsView = false,
        ifExists = false,
    } = {}) {

        const tblDef = this.#showRelation({ namespace, name }, { assertIsView, ifExists });
        if (!tblDef) return null;

        if (tblDef.kind === 'view' && actions?.length)
            throw new Error(`Unexpected actions list for a view`);

        const relationDDL = new RelationDDL(this, tblDef);

        const {
            namespace_id: nsDef,
            columns: resolveColumns,
            constraints: resolvedConstraints,
            indexes: resolvedIndexes,
            structuralChanges,
            ...resolvedTblDef
        } = await relationDDL.apply({
            namespace: newNamespace,
            name: newName,
            source_expr,
            source_expr_ast,
            column_aliases,
            view_opts_replication_mode,
            view_opts_replication_origin,
            view_opts_replication_opts,
            engine_attrs,
            // For versioning
            actions,
        });

        if (Object.keys(structuralChanges).length) {
            if (tblDef.kind === 'view') {
                await this.getRelation({ namespace: tblDef.namespace_id.name, name: tblDef.name }, { assertIsView: true }).reset({ syncForget: false });
            }
            const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
            const sysConstraints = this.getRelation({ namespace: 'sys', name: 'sys_constraints' });
            const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });

            const existingColumns = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
            const existingConstraints = sysConstraints.get({ relation_id: tblDef.id }, { using: 'sys_constraints__relation_id_idx', multiple: true });
            const existingIndexes = sysIndexes.get({ relation_id: tblDef.id }, { using: 'sys_indexes__relation_id_idx', multiple: true });

            // Drop all existing columns and constraints and indexes
            await this.#dropColumns(existingColumns, true);
            await this.#dropConstraints(existingConstraints, true);
            await this.#dropIndexes(existingIndexes, true);

            // Add new derived columns
            let resultCols = [];
            if (resolveColumns.length) resultCols = await this.#insertColumns(tblDef, resolveColumns);
            if (resolvedConstraints.length) await this.#insertConstraints(tblDef, resolvedConstraints, resultCols);
            if (resolvedIndexes?.length) await this.#insertIndexes(tblDef, resolvedIndexes, resultCols);
        }

        for (const action of actions || []) {
            if (action.type === 'add:column') {
                await this.#addColumnsToRelation(tblDef, [action.column]);
            } else if (action.type === 'add:constraint') {
                await this.#addConstraintsToRelation(tblDef, [action.constraint]);
            } else if (action.type === 'add:index') {
                await this.#addIndexesToRelation(tblDef, [action.index]);
            } else if (action.type === 'alter:column') {
                await this.#alterColumnInRelation(tblDef, action.name, action);
            } else if (action.type === 'rename:column') {
                await this.#renameColumnInRelation(tblDef, action.oldName, action.name);
            } else if (action.type === 'rename:index') {
                await this.#renameIndexInRelation(tblDef, action.oldName, action.name);
            } else if (action.type === 'drop:column') {
                await this.#dropColumnsFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
            } else if (action.type === 'drop:constraint') {
                await this.#dropConstraintsFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
            } else if (action.type === 'drop:index') {
                await this.#dropIndexesFromRelation(tblDef, [action.name], { cascade: action.cascade === true });
            } else {
                throw new Error(`Unsupported ALTER TABLE action ${JSON.stringify(action.type)}`);
            }
        }

        const sysTables = this.getRelation({ namespace: 'sys', name: 'sys_relations' });
        return await sysTables.update(tblDef, {
            namespace_id: nsDef.id,
            ...resolvedTblDef
        }, { systemTag: SYSTEM_TAG });
    }

    async #dropRelation({ namespace, name }, { ifExists = false, cascade = false, assertIsView = false, assertPersistence = null } = {}) {
        const tblDef = this.#showRelation({ namespace, name }, { ifExists, assertIsView });

        if (assertPersistence && tblDef && tblDef.persistence !== assertPersistence)
            throw new Error(`The referenced relation ${JSON.stringify(namespace)}.${JSON.stringify(name)} has a different persitence mode "${tblDef.persistence}" than the implied "${assertPersistence}"`);

        if (tblDef) await this.#dropRelations([tblDef], cascade);
        return tblDef;
    }

    // ----------
    // Table
    // ----------

    listTables(filter = null, { details = false } = {}) {
        return this.#listRelations(filter, { details });
    }

    showTable({ namespace, namespace_id = null, name, id = null, versionSpec = null }, { schema = false, ifExists = false } = {}) {
        return this.#showRelation({ namespace, namespace_id, name, id, versionSpec }, { schema, ifExists });
    }

    async createTable({ namespace, name, persistence = 'default', columns = [], constraints = [], indexes = [], ...unexpected }, { ifNotExists = false } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        const createSpec = { namespace, name, kind: 'table', persistence, columns, constraints, indexes, };
        return await this.#createRelation(createSpec, { ifNotExists });
    }

    async createTableAs({ namespace, name, persistence, source_expr, source_expr_ast, column_aliases = [], ...unexpected }, { ifNotExists = false } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        const createSpec = { namespace, name, kind: 'table', persistence, source_expr, source_expr_ast, column_aliases, };
        return await this.#createRelation(createSpec, { ifNotExists });
    }

    async alterTable({ namespace, name }, { namespace: newNamespace, name: newName, actions = [], ...unexpected }, { ifExists = false } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        const alterSpec = { namespace: newNamespace, name: newName, actions, };
        return await this.#alterRelation({ namespace, name }, alterSpec, { ifExists });
    }

    async dropTable({ namespace, name }, { ifExists = false, cascade = false } = {}) {
        return await this.#dropRelation({ namespace, name }, { ifExists, cascade });
    }

    // ----------
    // View
    // ----------

    listViews(filter = null, { details = false } = {}) {
        if (typeof filter === 'boolean') {
            [details, filter] = [filter, null];
        }
        const filterFn = typeof filter === 'function' ? filter : null;
        const { namespace, persistence, replication_mode } = typeof filter === 'object' && filter ? filter : {};

        if (filterFn) {
            return this.#listRelations((tblDef) => {
                if (tblDef.kind !== 'view') return false;
                return filterFn(tblDef);
            }, { details });
        }

        return this.#listRelations({ namespace, kind: 'view', persistence, replication_mode }, { details });
    }

    showView({ namespace, namespace_id = null, name, id = null }, { schema = false, ifExists = false } = {}) {
        return this.#showRelation({ namespace, namespace_id, name, id }, { schema, ifExists, assertIsView: true });
    }

    async createView({
        namespace,
        name,
        persistence = 'default',
        source_expr,
        source_expr_ast,
        column_aliases = [],
        replication_mode = null,
        replication_origin = null,
        replication_opts = null,
        ...unexpected
    }, {
        ifNotExists = false
    } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        const result = await this.#createRelation({
            namespace,
            name,
            persistence,
            source_expr,
            source_expr_ast,
            column_aliases,
            view_opts_replication_mode: replication_mode,
            view_opts_replication_origin: replication_origin,
            view_opts_replication_opts: replication_opts,
            kind: 'view' // Force
        }, { ifNotExists });

        // Sync new instance
        const syncResult = await this.#storageEngine.sync.sync({ [namespace]: name }, { tx: this.#tx });
        if (syncResult.failed?.length) throw new Error(`View was created but sync failed with error: ${syncResult.failed[0].error}`);

        return result;
    }

    async alterView({
        namespace,
        name
    }, {
        namespace: newNamespace,
        name: newName,
        persistence,
        source_expr,
        source_expr_ast,
        column_aliases,
        replication_mode,
        replication_origin,
        replication_opts,
        ...unexpected
    }, {
        ifExists = false
    } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        // Entirely forget instance
        await this.#storageEngine.sync.forget({ [namespace]: name }, { tx: this.#tx });

        const result = await this.#alterRelation({
            namespace,
            name
        }, {
            namespace: newNamespace,
            name: newName,
            persistence,
            source_expr,
            source_expr_ast,
            column_aliases,
            view_opts_replication_mode: replication_mode,
            view_opts_replication_origin: replication_origin,
            view_opts_replication_opts: replication_opts,
        }, {
            ifExists,
            assertIsView: true
        });

        // Sync new instance
        if (result) {
            const syncResult = await this.#storageEngine.sync.sync({ [newNamespace || namespace]: newName || name }, { tx: this.#tx });
            if (syncResult.failed?.length) throw new Error(`View was altered but sync failed with error: ${syncResult.failed[0].error}`);
        }

        return result;
    }

    async dropView({ namespace, name }, { ifExists = false, cascade = false, assertPersistence = null }) {
        const result = await this.#dropRelation({ namespace, name }, { ifExists, cascade, assertIsView: true, assertPersistence });
        // Entirely forget instance
        if (result) await this.#storageEngine.sync.forget({ [namespace]: name }, { tx: this.#tx });
        return result;
    }

    // ----------
    // Index
    // ----------

    showIndex({ namespace, table = null, name }) {
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });
        if (table) {
            const tblDef = this.#showRelation({ namespace, name: table });
            const idx = sysIndexes.get({ relation_id: tblDef.id, name }, { using: 'sys_indexes__relation_id_name_idx' });
            if (!idx) throw new Error(`Index ${JSON.stringify(name)} does not exist`);
            return { idx, tblDef };
        }

        const tblDefs = this.#listRelations({ namespace }, { details: true });
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
        const tblDef = this.#showRelation({ namespace, name: table });
        const [resultIdx] = await this.#insertIndexes(tblDef, [idx]);
        return resultIdx;
    }

    async alterIndex({ namespace, table = null, name }, { name: newName, namespace: newNamespace = null }) {
        const { idx, tblDef } = this.showIndex({ namespace, table, name });
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });
        if (newNamespace && newNamespace !== tblDef.namespace_id.name) {
            await this.alterTable(
                { namespace: tblDef.namespace_id.name, name: tblDef.name },
                { namespace: newNamespace }
            );
        }
        return newName ? await sysIndexes.update(idx, { name: newName }, { systemTag: SYSTEM_TAG }) : idx;
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
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
        const col = sysColumns.get({ relation_id: tblDef.id, name: columnName }, { using: 'sys_columns__relation_id_name_idx' });
        if (!col) throw new Error(`Column ${JSON.stringify(columnName)} does not exist`);
        if (operation === 'SET DEFAULT') {
            await sysColumns.update(col, { default_expr_ast: expr }, { systemTag: SYSTEM_TAG });
        } else if (operation === 'DROP DEFAULT') {
            await sysColumns.update(col, { default_expr_ast: null }, { systemTag: SYSTEM_TAG });
        } else if (operation === 'SET NOT NULL') {
            await this.#assertNoNulls(tblDef, columnName);
            await sysColumns.update(col, { not_null: true }, { systemTag: SYSTEM_TAG });
        } else if (operation === 'DROP NOT NULL') {
            await sysColumns.update(col, { not_null: false }, { systemTag: SYSTEM_TAG });
        } else {
            throw new Error(`Unsupported ALTER COLUMN operation ${JSON.stringify(operation)}`);
        }
    }

    async #renameColumnInRelation(tblDef, oldName, newName) {
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
        const col = sysColumns.get({ relation_id: tblDef.id, name: oldName }, { using: 'sys_columns__relation_id_name_idx' });
        if (!col) throw new Error(`Column ${JSON.stringify(oldName)} does not exist`);
        await sysColumns.update(col, { name: newName }, { systemTag: SYSTEM_TAG });
        await this.#rewriteRelationRows(tblDef, (row) => {
            const nextRow = { ...row, [newName]: row[oldName] };
            delete nextRow[oldName];
            return nextRow;
        });
    }

    async #renameIndexInRelation(tblDef, oldName, newName) {
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });
        const idx = sysIndexes.get({ relation_id: tblDef.id, name: oldName }, { using: 'sys_indexes__relation_id_name_idx' });
        if (!idx) throw new Error(`Index ${JSON.stringify(oldName)} does not exist`);
        await sysIndexes.update(idx, { name: newName }, { systemTag: SYSTEM_TAG });
    }

    async #dropColumnsFromRelation(tblDef, columnNames, { cascade = false } = {}) {
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
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
        const sysConstraints = this.getRelation({ namespace: 'sys', name: 'sys_constraints' });
        const constraints = constraintNames.map((constraintName) => {
            const con = sysConstraints.get({ relation_id: tblDef.id, name: constraintName }, { using: 'sys_constraints__relation_id_name_idx' });
            if (!con) throw new Error(`Constraint ${JSON.stringify(constraintName)} does not exist`);
            return con;
        });
        await this.#dropConstraints(constraints, cascade);
    }

    async #dropIndexesFromRelation(tblDef, indexNames, { cascade = false } = {}) {
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });
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
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
        const sysTypes = this.getRelation({ namespace: 'sys', name: 'sys_types' });
        const altSysTypes = bootstrapCatalog.get('sys_types');

        const resultCols = [];
        const existingCols = sysColumns.get({ relation_id: tblDef.id }, { using: 'sys_columns__relation_id_idx', multiple: true });
        let position = existingCols.reduce((max, col) => Math.max(max, col.position), 0) + 1;

        for (const _col of columns) {
            const col = await this.#parser.resolve_columnDef(_col, (col, prop) => {
                if (prop === 'type') {
                    const normalizedTypeName = col.type.toUpperCase();
                    col.type_id = sysTypes.get({ namespace_id: 1, name: normalizedTypeName }, { using: 'sys_types__namespace_id_name_idx' })?.id
                        || altSysTypes.get({ namespace_id: 1, name: normalizedTypeName }, { using: true })?.id;
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
            }, { systemTag: SYSTEM_TAG });

            resultCols.push(resultCol);
        }

        return resultCols;
    }

    async #insertConstraints(tblDef, constraints, tblCols = null) {
        const sysNs = this.getRelation({ namespace: 'sys', name: 'sys_namespaces' });
        const sysTables = this.getRelation({ namespace: 'sys', name: 'sys_relations' });
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
        const sysConstraints = this.getRelation({ namespace: 'sys', name: 'sys_constraints' });
        const sysDependencies = this.getRelation({ namespace: 'sys', name: 'sys_dependencies' });

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
            }, { systemTag: SYSTEM_TAG });

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
                }, { systemTag: SYSTEM_TAG });
            }

            resultCons.push(resultCon);
        }

        return resultCons;
    }

    async #insertIndexes(tblDef, indexes, tblCols = null) {
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });

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
            }, { systemTag: SYSTEM_TAG });

            resultIdxs.push(resultIdx);
        }

        const tblStorage = this.getRelation(tblDef);
        const rowsBefore = tblStorage.getAll();

        for (const version of rowsBefore) {
            await tblStorage.addToIndexes(resultIdxs, version);
        }

        this.#tx.addUndo(() => {
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
        const sysNs = this.getRelation({ namespace: 'sys', name: 'sys_namespaces' });
        const sysTables = this.getRelation({ namespace: 'sys', name: 'sys_relations' });
        const sysDependencies = this.getRelation({ namespace: 'sys', name: 'sys_dependencies' });

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

            await sysNs.delete(nsDef, { systemTag: SYSTEM_TAG });
            await this.#clearDependencies('namespace', nsDef.id);
        }
    }

    async #dropRelations(tblDefs, cascade = false) {
        const sysTables = this.getRelation({ namespace: 'sys', name: 'sys_relations' });
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
        const sysConstraints = this.getRelation({ namespace: 'sys', name: 'sys_constraints' });
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });
        const sysDependencies = this.getRelation({ namespace: 'sys', name: 'sys_dependencies' });

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

            await sysTables.delete(tblDef, { systemTag: SYSTEM_TAG });
            await this.#clearDependencies('relation', tblDef.id);
        }
    }

    async #dropColumns(columns, cascade = false) {
        const sysColumns = this.getRelation({ namespace: 'sys', name: 'sys_columns' });
        const sysConstraints = this.getRelation({ namespace: 'sys', name: 'sys_constraints' });
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });
        const sysDependencies = this.getRelation({ namespace: 'sys', name: 'sys_dependencies' });

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
            await sysColumns.delete(col, { systemTag: SYSTEM_TAG });
            await this.#clearDependencies('column', col.id);
        }
    }

    async #dropConstraints(constraints, cascade = false) {
        const sysConstraints = this.getRelation({ namespace: 'sys', name: 'sys_constraints' });
        const sysDependencies = this.getRelation({ namespace: 'sys', name: 'sys_dependencies' });

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
            await sysConstraints.delete(con, { systemTag: SYSTEM_TAG });
            await this.#clearDependencies('constraint', con.id);
        }
    }

    async #dropIndexes(indexes, cascade = false) {
        const sysIndexes = this.getRelation({ namespace: 'sys', name: 'sys_indexes' });
        const sysDependencies = this.getRelation({ namespace: 'sys', name: 'sys_dependencies' });

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
            await sysIndexes.delete(idx, { systemTag: SYSTEM_TAG });
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
        const sysDependencies = this.getRelation({ namespace: 'sys', name: 'sys_dependencies' });
        const matching = sysDependencies.getAll().filter((dep) => (
            dep.dependent_object_kind === objectKind && dep.dependent_object_id === objectId
        ) || (
                dep.referenced_object_kind === objectKind && dep.referenced_object_id === objectId
            ));
        for (const dep of matching) {
            if (sysDependencies.exists(dep)) await sysDependencies.delete(dep, { systemTag: SYSTEM_TAG });
        }
    }

    async #validateConstraintsOnExistingRows(tblDef, constraints) {
        const tableStorage = this.getRelation(tblDef);
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
                const target = this.getRelation({ namespace: constraint.target_namespace || tblDef.namespace_id.name, name: constraint.target_relation });
                for (const row of rows) {
                    const where = {};
                    const sourceColumns = constraint.columns || [];
                    const targetColumns = constraint.target_columns || [];
                    if (sourceColumns.every((col) => row[col] === null || row[col] === undefined)) continue;
                    targetColumns.forEach((col, i) => { where[col] = row[sourceColumns[i]]; });
                    if (!target.get(where)) throw new Error(`[${constraint.name || constraint.kind}] Existing rows violate foreign key`);
                }
            } else if (constraint.kind === 'CHECK' && constraint.ck_expression_ast) {
                const exprNode = registry.Expr.fromJSON(constraint.ck_expression_ast, { dialect: this.#storageEngine.dialect, assert: true });
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
        const tableStorage = this.getRelation(tblDef);
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

    async #rewriteRelationRows(tblDef, transformRow) {
        const tableStorage = this.getRelation(tblDef);
        const rows = tableStorage.getAll();
        for (const row of rows) {
            const nextRow = transformRow({ ...row });
            await tableStorage.update(row, nextRow, { systemTag: SYSTEM_TAG });
        }
    }

    async #assertNoNulls(tblDef, columnName) {
        const tableStorage = this.getRelation(tblDef);
        const rows = tableStorage.getAll();
        const hasNulls = rows.some((row) => row[columnName] === null || row[columnName] === undefined);
        if (hasNulls)
            throw new Error(`Column ${JSON.stringify(columnName)} contains nulls and cannot be set NOT NULL`);
    }
}

function captureStackTrace() {
    try { throw new Error(''); } catch (e) {
        return e.stack.split('\n').slice(3).join('\n');
    }
}
