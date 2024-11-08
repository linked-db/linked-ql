import { _from as _arrFrom, _difference, _intersect } from '@webqit/util/arr/index.js';
import { _isObject } from '@webqit/util/js/index.js';
import { Str } from '../lang/expr/types/Str.js';
import { Identifier } from '../lang/expr/Identifier.js';
import { AbstractNode } from '../lang/AbstractNode.js';
import { AlterDatabase } from '../lang/ddl/AlterDatabase.js';
import { CreateDatabase } from '../lang/ddl/CreateDatabase.js';
import { DropDatabase } from '../lang/ddl/DropDatabase.js';
import { RenameDatabase } from '../lang/ddl/RenameDatabase.js';
import { RootSchema } from '../lang/ddl/RootSchema.js';
import { RootCDL } from '../lang/ddl/RootCDL.js';
import { Savepoint } from './Savepoint.js';
import { Parser } from '../lang/Parser.js';

export class AbstractClient {

    /**
     * @constructor
     */
    constructor(params = {}) {
        Object.defineProperty(this, '$', {
            value: {
                params: {
                    schemaCacheInvalidation: 1,
                    schemaSelector: ['!information_schema', '!linked_db%', ...(params.dialect === 'postgres' ? ['!pg_%'] : [])],
                    ...params,
                }
            }
        });
    }

    /**
     * @property Object
     * - dialect
     * - commitRef
     * - ansiQuotes
     * - autoBindings
     * - schemaSelector
     * - schemaCacheInvalidation
     * - mysqlReturningClause
     */
    get params() { return this.$.params || {}; }

    /**
     * Alias of this.schema() with standard default params
     * 
     * @param Array|Object          params
     * @param Function              callback
     * 
     * @param Function              callback
     * 
     * @return Any
     */
    async withSchema(...args) {
        const callback = args.pop();
        if (args[0] === false) return callback(); // IMPORTANT: withSchema() callers can do this for convenience
        const params = Array.isArray(args[0]) || _isObject(args[0]) ? args.pop() : { depth: 2 };
        return await this.schema(params, callback);
    }

    /**
     * Base logic for this.schema()
     * 
     * @param Function                  $execFetchSchema
     * @param Array|Object              params
     * @param Array                     ...rest
     * 
     * @return Object|Any
     */
    async schema($execFetchSchema, params = {}, ...rest) {
        const exactMatching = typeof rest[0] === 'boolean' ? rest.shift() : true;
        const callback = typeof rest[0] === 'function' ? rest.shift() : ((result) => result);
        const cacheable = _isObject(params) && params.depth === 2 && !(params.selector || []).length;
        const cacheInvalidation = cacheable ? this.params.schemaCacheInvalidation : 2;
        let isNew, entry = this.#matchSchemaRequest(params, exactMatching);
        if (!entry) {
            const schemaPromise = Promise.resolve($execFetchSchema(_isObject(params) ? { ...params, selector: (params.selector || []).length ? params.selector : this.params.schemaSelector } : params)).then((schemaJson) => {
                if (Array.isArray(params)) {
                    schemaJson = schemaJson.reduce((dbs, db) => {
                        const ss = params.find(ss => ss.name === db.name);
                        const tablesList = [].concat(ss?.tables || []);
                        if (tablesList.length && tablesList[0] !== '*') db = { ...db, tables: db.tables.filter(tbl => tablesList.includes(tbl.name)) };
                        return dbs.concat(ss && db || []);
                    }, []);
                }
                return RootSchema.fromJSON(this, schemaJson);
            });
            // Get this into the stack without awaiting result
            entry = { params, schemaPromise };
            this.#schemaRequestStack.add(entry);
            schemaPromise.then((resolvedSchema) => {
                // Resolve
                entry.resolvedSchema = resolvedSchema;
                delete entry.schemaPromise;
                if (cacheInvalidation === 1) {
                    // In live mode!!!
                    this.listen('savepoints', (e) => {
                        const payload = JSON.parse(e.payload);
                        if (payload.action === 'DELETE') return;
                        const savepoint = new Savepoint(this, payload.body);
                        const rootCDL = RootCDL.fromJSON(this, { actions: [savepoint.querify()] });
                        entry.resolvedSchema = entry.resolvedSchema.alterWith(rootCDL, { diff: false });
                    });
                }
            });
            isNew = true;
        }
        const returnValue = await callback(entry.resolvedSchema || (await entry.schemaPromise));
        if (isNew && cacheInvalidation === 2) {
            this.#schemaRequestStack.delete(entry);
        }
        return returnValue;
    }

    /**
     * Main query API
     * 
     * @param Array                   args
     * 
     * @return Any
     */
    async query(...args) {
        let query, params = {};
        if (_isObject(args[0]) && !(args[0] instanceof AbstractNode)) {
            ({ query, ...params } = args[0]);
        } else {
            query = args.shift();
            if (Array.isArray(args[0])) params.values = args.shift();
            if (_isObject(args[0])) params = { ...params, ...args.shift() };
        }
        if (typeof query === 'string') {
            query = Parser.parse(this, query, null, { inspect: params.inspect });
        }
        return await this.execQuery(query, params);
    }

    /**
     * Composes a CREATE DATABASE query from descrete inputs
     * 
     * @param String|Object  createSpec
     * @param Object         params
     * 
     * @return Savepoint
     */
    async createDatabase(createSpec, params = {}) {
        if (typeof createSpec === 'string') { createSpec = { name: createSpec }; }
        const query = CreateDatabase.fromJSON(this, { argument: createSpec });
        if (params.ifNotExists) query.withFlag('IF_NOT_EXISTS');
        return await this.execQuery(query, params);
    }

    /**
     * Composes a DROP DATABASE query from descrete inputs
     * 
     * @param String            dbName
     * @param String            dbToName
     * @param Object            params
     * 
     * @return Savepoint
     */
    async renameDatabase(dbName, dbToName, params = {}) {
        const query = RenameDatabase.fromJSON(this, { reference: dbName, argument: dbToName });
        if (!query) throw new Error(`renameDatabase() called with an invalid arguments.`);
        return await this.execQuery(query, params);
    }

    /**
     * Composes an ALTER DATABASE query from descrete inputs
     * 
     * @param String|Object   alterSpec
     * @param Function        callback
     * @param Object          params
     * 
     * @return Savepoint
     */
    async alterDatabase(alterSpec, callback, params = {}) {
        if (typeof callback !== 'function') throw new Error(`alterDatabase() called with invalid arguments.`);
        if (typeof alterSpec === 'string') { alterSpec = { name: alterSpec }; }
        return await this.withSchema(async () => {
            // -- Compose an altInstance from request
            const dbSchema = (await this.schema([{ name: alterSpec.name, tables: alterSpec.tables }])).database(alterSpec.name);
            if (!dbSchema) throw new Error(`Database "${alterSpec.name}" does not exist.`);
            const dbSchemaEditable = dbSchema.clone();
            await callback(dbSchemaEditable.$nameLock(true));
            const databaseCDL = dbSchema.diffWith(dbSchemaEditable).generateCDL({ cascade: params.cascade });
            if (!databaseCDL.length) return;
            const query = AlterDatabase.fromJSON(this, { reference: dbSchema.name(), argument: databaseCDL });
            return await this.execQuery(query, params);
        });
    }

    /**
     * Composes a DROP DATABASE query from descrete inputs
     * 
     * @param String            dbName
     * @param Object            params
     * 
     * @return Savepoint
     */
    async dropDatabase(dbName, params = {}) {
        const query = DropDatabase.fromJSON(this, { reference: dbName });
        if (!query) throw new Error(`dropDatabase() called with an invalid arguments.`);
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.cascade) query.withFlag('CASCADE');
        return await this.execQuery(query, params);
    }

    /**
     * Tells whether a database exists.
     * 
     * @param String            name
     * 
     * @return Bool
     */
    async hasDatabase(name) {
        return (await this.databases()).includes(name);
    }

    /**
     * Returns list of databases.
     * 
     * @return Array
     */
    async databases() {
        return (await this.schema()).databases(false);
    }

    /**
     * Returns a database instance.
     * 
     * @param String            name
     * @param Object            params
     * 
     * @return Database
     */
    database(name, params = {}) {
        return new this.constructor.Database(this, ...arguments);
    }

    /**
     * Base logic for dropDatabase()
     * 
     * @param String                    query
     * @param Object                    params
     * 
     * @return Any
     */
    async execQuery(query, params = {}) {
        if (!(query instanceof AbstractNode)) {
            throw new Error(`execQuery() called with invalid arguments.`);
        }
        const willNeedSchema = query.statementType === 'DDL' || query.hasPaths;
        return await this.withSchema(willNeedSchema, async (rootSchema) => {
            if (query.statementType === 'DDL') {
                return await this.execDDL(query, rootSchema, params);
            }
            const vars = {}
            // IMPORTANT: The order of the following
            query.renderBindings?.(params.values || []);
            if (query.hasSugars) query = query.deSugar();
            // IMPORTANT: The order of the following
            if (query.isPayloadStatement) {
                [vars.preHook, vars.postHook] = query.createExecutionPlan($query => this.execQuery($query, { inspect: params.inspect }));
                await vars.preHook();
            }
            // All non-DDL statements support bindings
            const queryBindings = query.normalizeBindings?.(true).map(b => b.value()) || [];
            const $queryBindings = queryBindings.map(value => Array.isArray(value) || typeof value === 'object' && value ? JSON.stringify(value) : value);
            // Visualize? Now!
            if (params.inspect) console.log({ guery: query.stringify(), values: $queryBindings });
            if (query.statementType === 'DML') {
                vars.returnValue = await this.execDML(query, $queryBindings, params);
            } else if (query.statementType === 'DQL') {
                vars.returnValue = await this.execDQL(query, $queryBindings, params);
            } else {
                vars.returnValue = await this.execSQL(query, $queryBindings, params);
            }
            if (query.isPayloadStatement) {
                vars.returnValue = await vars.postHook(vars.returnValue);
            }
            return vars.returnValue;
        });
    }

    /**
     * Base logic for this.execDDL()
     * 
     * @param Function $execDDL 
     * @param Statement query 
     * @param RootSchema rootSchema 
     * @param Object params 
     * 
     * @returns Savepoint
     */
    async execDDL($execDDL, query, rootSchema, params) {
        const vars = {
            dbAction: query,
            mainSavepointData: null,
            cascadeSavepointsData: [],
        };
        // Normalise to db-level query
        if (['TABLE', 'VIEW'].includes(query.KIND)) {
            if (query.CLAUSE === 'CREATE' && !query.argument().prefix()) {
                query.argument().prefix(rootSchema.defaultDB());
            }
            vars.dbAction = AlterDatabase.fromJSON(this, {
                reference: (query.reference?.() || query.argument()).prefix(true).name(),
                argument: { actions: [query] }
            });
        }
        vars.rootCDL = RootCDL.fromJSON(this, { actions: [vars.dbAction] });
        // Generate savepoint data
        if (!params.noCreateSavepoint) {
            const $rootSchema = rootSchema.alterWith(vars.rootCDL, { diff: true });
            vars.dbName = (vars.dbAction.reference?.() || vars.dbAction.argument()).name();
            [vars.mainSavepointData, vars.cascadeSavepointsData] = $rootSchema.databases().reduce(([main, cascades], db) => {
                if (db.identifiesAs(vars.dbName)) return [db, cascades];
                return [main, cascades.concat(db.dirtyCheck(true).length ? db : [])];
            }, [null, []]);
        }
        if (params.inspect) console.log({ guery: query.stringify() });
        await $execDDL(query, rootSchema, params);
        vars.returnValue = true;
        if (vars.mainSavepointData) {
            vars.returnValue = await this.createSavepoint(vars.mainSavepointData, { ...params, masterSavepoint: null });
            vars.returnValue.$._cascades = [];
            for (const cascadeSavepointData of vars.cascadeSavepointsData) {
                vars.returnValue.$._cascades.push(await this.createSavepoint(cascadeSavepointData, { ...params, masterSavepoint: vars.returnValue.id() }));
            }
        }
        const entry = this.#matchSchemaRequest({ depth: 2 });
        entry.resolvedSchema = entry.resolvedSchema.alterWith(vars.rootCDL, { diff: false });
        return vars.returnValue;
    }

    /**
     * Method for saving snapshots to internal OBJ_INFOSCHEMA db.
     * 
     * @param DatabaseSchema    dbSchema
     * @param String            description
     * 
     * @return Object
     */
    async createSavepoint(dbSchema, details = {}) {
        const linkedDB = await this.linkedDB();
        const savepointsTable = linkedDB.table('savepoints');
        // -- Savepoint JSON
        const { name, $name, version: _, ...rest } = dbSchema.jsonfy({ nodeNames: false });
        const savepointJson = {
            master_savepoint: details.masterSavepoint,
            name,
            $name,
            database_tag: null,
            ...rest,
            version_tag: null,
            version_state: 'commit',
            commit_date: q => q.now(),
            commit_desc: details.desc,
            commit_ref: details.ref || this.params.commitRef,
            commit_pid: q => q.literal(this.params.dialect === 'mysql' ? 'connection_id()' : 'pg_backend_pid()'),
        };
        // -- Find a match first. We're doing forward first to be able to restart an entire history that has been rolled all the way back
        const dbName = dbSchema.name()/* IMPORTANT: not $name() */;
        const currentSavepoint = (await this.database(dbName).savepoint({ lookAhead: true, withCascades: false })) || await this.database(dbName).savepoint({ withCascades: false });
        if (currentSavepoint) {
            // -- Apply id and tag from lookup
            savepointJson.database_tag = currentSavepoint.databaseTag();
            savepointJson.version_tag = details.masterSavepoint ? 0 : currentSavepoint.versionMax() + 1;
            // -- Delete all forward records
            if (!details.masterSavepoint && currentSavepoint.versionState() === 'rollback') {
                await savepointsTable.delete(q => q.where(
                    q => q.eq('database_tag', q => q.value(currentSavepoint.databaseTag())),
                    q => q.eq('version_state', q => q.value('rollback')),
                ));
            }
        } else {
            // -- Generate tag and version as fresh
            savepointJson.database_tag = `db.${Date.now()}`;
            savepointJson.version_tag = details.masterSavepoint ? 0 : 1;
        }
        // -- Create record
        const insertResult = await savepointsTable.insert(savepointJson, { returning: '*' });
        return new Savepoint(this, insertResult);
    }

    /**
     * Returns all databases' current savepoint.
     * 
     * @param Object params
     * 
     * @returns Object
     */
    async getSavepoints(params = {}) {
        const linkedDB = await this.linkedDB();
        const tableIdent = linkedDB.table('savepoints').ident;
        const utils = this.createCommonSQLUtils();
        const fieldsLite = [`COALESCE(${utils.ident('$name')}, name) AS name`, 'database_tag', 'version_tag'];
        const fieldsStd = ['master_savepoint', 'id', 'database_tag', 'name', utils.ident('$name'), 'status', 'version_tag', 'tables', 'version_state', 'commit_date', 'commit_desc', 'commit_ref', 'rollback_date', 'rollback_desc', 'rollback_ref'];
        const versionTagsField = `(SELECT ${utils.jsonAgg('version_tag')} FROM ${tableIdent}
            WHERE database_tag = main_savepoint.database_tag
        ) AS version_tags`;
        const cascadesFields = `(SELECT ${utils.jsonAgg('cascade')} FROM (
            SELECT ${utils.jsonBuildObject(fieldsStd.reduce(($fields, f) => $fields.concat(`'${f}'`, f), []))} AS cascade
            FROM ${tableIdent}
            WHERE master_savepoint = main_savepoint.id
        )) AS cascades`;
        const normalizeJson = (savepointJson) => ({ ...savepointJson, version_tags: savepointJson.version_tags.filter(c => c !== 0).sort(), cascades: savepointJson.cascades || [] });
        if (params.histories) {
            return (await this.query(`
                SELECT ${[...fieldsStd, versionTagsField, cascadesFields].join(', ')} 
                FROM ${tableIdent} AS main_savepoint 
                WHERE master_savepoint IS NULL
            `)).map(normalizeJson);
        }
        const fields = params.lite
            ? [...fieldsLite, versionTagsField]
            : [...fieldsStd, versionTagsField, ...(params.withCascades !== false ? [cascadesFields] : [])];
        const schemaSelector = [].concat(params.selector || []);
        const result = await this.query(`
            SELECT ${fields.join(', ')} FROM (
                SELECT *,
                ROW_NUMBER() OVER (PARTITION BY database_tag ORDER BY version_state = ${params.lookAhead ? `'rollback'` : `'commit'`} DESC, version_tag ${params.lookAhead ? 'ASC' : 'DESC'}) AS rank_for_target,
                FROM ${tableIdent}
                WHERE master_savepoint IS NULL
            ) AS main_savepoint WHERE version_state = ${params.lookAhead ? `'rollback'` : `'commit'`} AND rank_for_target = 1${params.selector ? (params.lookAhead ? ` AND ${utils.matchSelector('name', schemaSelector)}` : ` AND ${utils.matchSelector(`COALESCE(${utils.ident('$name')}, name)`, schemaSelector)}`) : ''}
        `);
        if (params.lite) return result;
        return result.map((savepointJson) => new Savepoint(this, normalizeJson(savepointJson)));
    }

    /**
     * ----------------
     */

    /**
     * Base logic for this.getPID()
     * 
     * @param Function $pid
     * 
     * @returns String
     */
    #pid;
    async getPID($execGetPID) {
        if (!this.#pid) this.#pid = await $execGetPID();
        return this.#pid;
    }

    /**
     * Base logic for this.listen()
     * 
     * @param Function      $execListen
     * @param String        channel
     * @param Function      callback
     * 
     * @returns this
     */
    #listeners = new Map;
    listen($execListen, channel, callback, ownEvents = false) {
        if (!this.#listeners.has(channel)) {
            this.#listeners.set(channel, new Set);
            $execListen(channel, async (e) => {
                const ownPid = await this.getPID();
                for (const [callback, ownEvents] of this.#listeners.get(channel)) {
                    if (!ownEvents && e.processId && e.processId === ownPid) continue;
                    callback(e);
                }
            });
        }
        this.#listeners.get(channel).add([callback, ownEvents]);
        return this;
    }

    /**
     * -------------------------------
     */

    /**
     * Get the schemaRequestStack entry matching params
     * 
     * @param Array|Object              params 
     * @param Bool                      exactMatching 
     * 
     * @returns Object
     */
    #schemaRequestStack = new Set;
    #matchSchemaRequest(params, exactMatching = false) {
        return [...this.#schemaRequestStack].find(req => {
            if (_isObject(req.params) && _isObject(params)) {
                return Object.keys(params).every(key => {
                    if (key === 'depth') {
                        // If ongoing request has higher depth, current does't matter
                        const [a, b] = [req.params[key] || 0, params[key] || 0];
                        return !exactMatching ? a >= b : a === b;
                    }
                    return req.params[key] === params[key];
                });
            }
            if (Array.isArray(req.params) && Array.isArray(params)) {
                return params.every(path2 => {
                    // If ongoing request already has the db name
                    return req.params.find(path1 => path2.name === path1.name
                        // If ongoing request has any of the tables mentioned in new request
                        && ((tbls2, tbls1) => exactMatching ? _intersect(tbls2, tbls1).length === tbls2.length : !_difference(tbls2, tbls1).length)(_arrFrom(path2.tables), _arrFrom(path1.tables)));
                });
            }
            if (_isObject(req.params) && req.params.depth && Array.isArray(params)) {
                // See if it's up to table depth
                const tblDepth = params.reduce((prev, s) => Math.max(prev, [].concat(s.tables || []).length), 0) ? 2 : 1;
                // Match depth
                return req.params.depth >= tblDepth;
            }
        });
    }

    /**
     * Respond to ROOT_SCHEMA requests.
     * 
     * @param String requestName
     * @param AbstractNode requestSource
     * 
     * @returns 
     */
    $capture(requestName, requestSource) {
        if (requestName === 'ROOT_SCHEMA') {
            return this.#matchSchemaRequest({ depth: 2 })?.resolvedSchema;
        }
    }

    /**
     * Create common SQL expression utilities
     * 
     * @returns Object
     */
    createCommonSQLUtils() {
        const utils = {
            ident: (name) => Identifier.fromJSON(this, name),
            str: (value) => Str.fromJSON(this, { value }),
            jsonBuildObject: (exprs) => this.params.dialect === 'mysql' ? `JSON_OBJECT(${exprs.join(', ')})` : `JSON_BUILD_OBJECT(${exprs.join(', ')})`,
            jsonAgg: (expr) => this.params.dialect === 'mysql' ? `JSON_ARRAYAGG(${expr})` : `JSON_AGG(${expr})`,
            anyValue: (col) => this.params.dialect === 'mysql' ? col : `MAX(${col})`,
            groupConcat: (col, orderBy) => this.params.dialect === 'mysql' ? `GROUP_CONCAT(${col}${orderBy ? ` ORDER BY ${orderBy}` : ``} SEPARATOR ',')` : `STRING_AGG(${col}, ','${orderBy ? ` ORDER BY ${orderBy}` : ``})`,
            matchSelector: (ident, enums) => {
                const [names, _names, patterns] = enums.reduce(([names, _names, patterns], e) => {
                    if (/^%|^!%|%$/.test(e)) return [names, _names, patterns.concat(e)];
                    if (/^!/.test(e)) return [names, _names.concat(e.slice(1)), patterns];
                    return [names.concat(e), _names, patterns];
                }, [[], [], []]);
                const $names = names.length && !(names.length === 1 && names[0] === '*') ? `${ident} IN (${names.map(utils.str).join(', ')})` : null;
                const $_names = _names.length ? `${ident} NOT IN (${_names.map(utils.str).join(', ')})` : null;
                const $patterns = patterns.length ? patterns.map((p) => /^!/.test(p) ? `${ident} NOT LIKE ${utils.str(p.slice(1))}` : `${ident} LIKE ${utils.str(p)}`).join(' AND ') : null;
                return [$names, $_names, $patterns].filter(s => s).join(' AND ');
            }
        };
        return utils;
    }

    /**
     * Returns LinkedDB DB instance; does setup work where necessary.
     * 
     * @return Database
     */
    async linkedDB() {
        const migrations = [
            // --v1: create base structure
            async (dbName) => {
                await this.createDatabase({
                    name: dbName,
                    tables: [{
                        name: 'savepoints',
                        columns: [
                            { name: 'id', ...(this.params.dialect === 'mysql' ? { type: 'char(36)', default: { expr: (q) => q.fn('uuid') } } : { type: 'uuid', default: { expr: (q) => q.fn('gen_random_uuid') } }), primaryKey: true },
                            { name: 'master_savepoint', ...(this.params.dialect === 'mysql' ? { type: 'char(36)' } : { type: 'uuid' }), foreignKey: { targetTable: [dbName, 'savepoints'], targetColumns: ['id'], deleteRule: 'CASCADE' } },
                            // Actual snapshot
                            { name: 'name', type: ['varchar', 255], notNull: true },
                            { name: '$name', type: ['varchar', 255] },
                            { name: 'tables', type: 'json' },
                            { name: 'status', type: ['varchar', 8], check: `status IN (null, 'new', 'obsolete')` },
                            // Meta data
                            { name: 'database_tag', type: ['varchar', 30], notNull: true },
                            { name: 'version_tag', type: 'int', notNull: true },
                            // Revision data
                            { name: 'version_state', type: ['varchar', 8], notNull: true, check: `version_state IN ('commit', 'rollback')` },
                            { name: 'commit_date', type: ['timestamp', 3], notNull: true },
                            { name: 'commit_desc', type: ['varchar', 255] },
                            { name: 'commit_ref', type: ['varchar', 255] },
                            { name: 'commit_pid', type: ['varchar', 50] },
                            { name: 'rollback_date', type: ['timestamp', 3] },
                            { name: 'rollback_desc', type: ['varchar', 255] },
                            { name: 'rollback_ref', type: ['varchar', 255] },
                            { name: 'rollback_pid', type: ['varchar', 50] },
                        ],
                    }],
                }, { noCreateSavepoint: true });
                if (this.params.dialect === 'postgres') {
                    await this.driver.query(`
                        -- The Function
                        CREATE OR REPLACE FUNCTION fire_savepoints_event() RETURNS trigger AS $$
                        BEGIN
                            PERFORM pg_notify('savepoints', json_build_object(
                                'action', TG_OP,
                                'body', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
                            )::text);
                            RETURN NEW;
                        END;
                        $$ LANGUAGE plpgsql;
                        -- The trigger
                        DROP TRIGGER IF EXISTS savepoints_event_trigger ON "${dbName}"."savepoints";
                        CREATE TRIGGER savepoints_event_trigger
                            AFTER INSERT OR UPDATE OR DELETE ON "${dbName}"."savepoints"
                            FOR EACH ROW EXECUTE FUNCTION fire_savepoints_event();
                    `);
                }
            },
        ];
        // -- Initialise
        const peakVersion = migrations.length;
        const baseName = (v) => 'linked_db' + (v && `_v${v}` || '');
        const instance = this.database(baseName(peakVersion));
        Object.defineProperty(instance, 'uninstall', {
            value: async (cascade) => {
                const returnValue = await this.dropDatabase(instance.name, { cascade, noCreateSavepoint: true });
                this.installed = false;
                return returnValue;
            }
        });
        if (this.installed) return instance;
        this.installed = true;
        // -- Install or upgrade
        const rootSchema = await this.schema({ depth: 1, selector: 'linked_db%' });
        const foundName = rootSchema.databases(false).find(dbName => dbName.startsWith(baseName()) || dbName === 'obj_information_schema');
        const foundVersion = foundName && /^.+?([\d]+)$/.exec(foundName)?.[1] || -1;
        if (foundName && foundVersion === -1) console.warn(`Your database has a old version of Linked DB that is no longer supported. Any savepoint record in there will be retained but won't be migrated to the new Linked DB version you have now. You may file an issue on github for any assistance.`);
        if (peakVersion < foundVersion) throw new Error(`Your database has a higher version of Linked DB "${foundVersion}" than this query client is designed to support "${peakVersion}". Consider upgrading this client to latest version.`);
        for (let i = 1; i <= migrations.length; i++) {
            if (i <= foundVersion) continue;
            const fromName = baseName(i - 1), toName = baseName(i);
            try {
                if (i > 1) await this.alterDatabase(fromName, dbSchema => dbSchema.name(toName), { noCreateSavepoint: true });
                await migrations[i - 1](toName);
            } catch (e) {
                if (!foundName && i === 1) console.log(`Error installing ${toName}.`);
                else console.log(`Error upgrading your Linked DB version from ${fromName} to ${toName}. Consider filing an issue on github.`);
                throw e;
            }
        }
        return instance;
    }
}