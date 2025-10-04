import { normalizeQueryArgs, normalizeSchemaSelectorArg } from './util.js';
import { AbstractStmt } from '../../lang/abstracts/AbstractStmt.js';
import { SchemaInference } from '../../lang/SchemaInference.js';
import { SimpleEmitter } from './SimpleEmitter.js';
import { registry } from '../../lang/registry.js';

export class AbstractClient extends SimpleEmitter {

    // ---------Contract

    get dialect() { throw new Error('Not implemented'); }
    get enableLive() { throw new Error('Not implemented'); }
    async connect() { throw new Error('Not implemented'); }
    async disconnect() { throw new Error('Not implemented'); }
    async query(ast, schemaName = 'public') { throw new Error('Not implemented'); }
    async showCreate(selector, schemaWrapped = false) { throw new Error('Not implemented'); }

    // ---------Implementeds

    #schemaInference;
    #subscribers = new Map;

    get schemaInference() { return this.#schemaInference; }

    constructor() {
        super();
        this.#schemaInference = new SchemaInference({ driver: this });
    }

    // ---------Queries

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
        });
        if (anyFound) await this.#schemaInference.provide(schemaSelector);

        // DeSugaring...
        query = query.deSugar(true, {}, null, this.#schemaInference);
        return [query, options];
    }

    // ---------Subscriptions

    subscribe(selector, callback) {
        if (typeof selector === 'function') {
            callback = selector;
            selector = '*';
        }
        const flattenedSelectorSet = normalizeSchemaSelectorArg(selector, true);
        this.#subscribers.set(callback, flattenedSelectorSet);
        return () => this.#subscribers.delete(callback);
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