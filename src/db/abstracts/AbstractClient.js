import '../../lang/index.js';
import { normalizeQueryArgs, normalizeSchemaSelectorArg } from './util.js';
import { AbstractStmt } from '../../lang/abstracts/AbstractStmt.js';
import { SchemaInference } from '../../lang/SchemaInference.js';
import { RealtimeClient } from '../realtime/RealtimeClient.js';
import { SimpleEmitter } from './SimpleEmitter.js';
import { registry } from '../../lang/registry.js';
import { Result } from '../Result.js';

export class AbstractClient extends SimpleEmitter {

    get dialect() { throw new Error('Not implemented'); }

    #subscribers = new Map;

    #schemaInference;
    #realtimeClient;

    #capabilityOverride;
    #workingCapability;

    get schemaInference() { return this.#schemaInference; }
    get realtimeClient() { return this.#realtimeClient; }

    constructor({ capability = {} } = {}) {
        super();
        this.#capabilityOverride = capability;
        this.#workingCapability = capability;
        this.#schemaInference = new SchemaInference({ driver: this });
        this.#realtimeClient = new RealtimeClient(this);
    }

    async connect() {
        await this._connect();
    }

    async disconnect() {
        await this.setCapability({ realtime: false });
        await this._disconnect();
    }

    async query(...args) {
        const [query, options] = await this._normalizeQueryArgs(...args);
        // Realtime query?
        if (options.live && query.fromClause?.()) {
            return await this.#realtimeClient.query(query, options);
        }
        const result = await this._query(query, options);
        return new Result({ rows: result.rows, rowCount: result.rowCount });
    }

    async showCreate(selector, schemaWrapped = false) {
        return await this._showCreate(selector, schemaWrapped);
    }

    async subscribe(selector, callback) {
        await this.setCapability({ realtime: true });

        if (typeof selector === 'function') {
            callback = selector;
            selector = '*';
        }
        
        const flattenedSelectorSet = normalizeSchemaSelectorArg(selector, true);
        this.#subscribers.set(callback, flattenedSelectorSet);

        return async () => {
            this.#subscribers.delete(callback);
            if (!this.#subscribers.size) {
                await this.setCapability({ realtime: false });
            }
        };
    }

    async setCapability(capMap) {
        const _capMap = Object.fromEntries(Object.entries(capMap).filter(([k, v]) => {
            return !v || this.#capabilityOverride[k] !== false;
        }));
        // realtime?
        if (_capMap.realtime === false) {
            await this._teardownRealtime();
        } else if (_capMap.realtime) {
            await this._setupRealtime();
        }
        // Publish...
        this.#workingCapability = {
            ...this.#workingCapability,
            ..._capMap,
        };
    }

    // ---------

    async _normalizeQueryArgs(...args) {
        let [query, options] = normalizeQueryArgs(...args);

        // Parsing...
        if (typeof query === 'string') {
            query = await registry.Script.parse(query, { dialect: options.dialect || this.dialect });
        } else if (!(query instanceof registry.Script) && !(query instanceof AbstractStmt)) {
            throw new TypeError('query must be a string or an instance of Script | AbstractStmt');
        }
        if (query instanceof registry.Script && query.length === 1) {
            query = query.entries()[0];
        }

        // Determine by heuristics if desugaring needed
        if ((query instanceof registry.DDLStmt && !query.returningClause?.()) // Desugaring not applicable
            || query.originSchemas?.()?.length // Desugaring already done
        ) return [query, options];

        // Schema inference...
        const schemaSelector = {};
        let anyFound = false;
        query.walkTree((v) => {
            if (v instanceof registry.DDLStmt
                && !v.returningClause?.()) return;
            if ((!(v instanceof registry.TableRef2) || v.parentNode instanceof registry.ColumnIdent)
                && (!(v instanceof registry.TableRef1) || v.parentNode instanceof registry.ColumnRef1)) {
                return v;
            }
            const schemaName = v.qualifier()?._get('delim')
                ? v.qualifier().value()
                : v.qualifier()?.value().toLowerCase() || '*';
            const tableName = v._get('delim')
                ? v.value()
                : v.value().toLowerCase();
            if (!(schemaName in schemaSelector)) {
                schemaSelector[schemaName] = [];
            }
            if (!schemaSelector[schemaName].includes(tableName)) {
                schemaSelector[schemaName].push(tableName);
                anyFound = true;
            }
        }, true);

        if (anyFound) await this.#schemaInference.provide(schemaSelector);

        // DeSugaring...
        query = query.deSugar(true, {}, null, this.#schemaInference);
        return [query, options];
    }

    _fanout(events) {
        const eventsAndPatterns = [];
        const allPatterns = new Set;
        for (const event of events) {
            const patterns = [
                JSON.stringify([event.relation.schema, event.relation.name]),
                JSON.stringify(['*', event.relation.name]),
                JSON.stringify([event.relation.schema, '*']),
            ];
            eventsAndPatterns.push({ event, patterns });
            allPatterns.add(patterns[0]);
            allPatterns.add(patterns[1]);
            allPatterns.add(patterns[2]);
        }
        for (const [cb, flattenedSelectorSet] of this.#subscribers.entries()) {
            let _events = [];
            // Match and filter
            for (const pattern of flattenedSelectorSet) {
                if (pattern === '["*","*"]') {
                    _events = [...events];
                    break;
                } else if (allPatterns.has(pattern)) {
                    for (const { event, patterns } of eventsAndPatterns) {
                        if (patterns.includes(pattern)) {
                            _events.push(event);
                        }
                    }
                    break;
                }
            }
            if (!_events.length) continue;
            // Successful match
            cb(_events);
        }
    }
}