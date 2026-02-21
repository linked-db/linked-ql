import { normalizeQueryArgs } from './util.js';
import { Abstract0SQLClient } from './Abstract0SQLClient.js';
import { AbstractNode } from '../../lang/abstracts/AbstractNode.js';
import { AbstractStmt } from '../../lang/abstracts/AbstractStmt.js';
import { RealtimeClient } from '../../proc/realtime/RealtimeClient.js';
import { registry } from '../../lang/registry.js';
import { Result } from '../Result.js';

export class Abstract1SQLClient extends Abstract0SQLClient {

    get dialect() { throw new Error('Not implemented'); }

    #realtimeClient;

    get realtimeClient() { return this.#realtimeClient; }

    constructor({ capability = {} } = {}) {
        super({ capability });
        this.#realtimeClient = new RealtimeClient(this);
    }

    async resolve(query, options = {}) {
        // Parsing...
        if (!(query instanceof AbstractNode)) {
            query = await this.parse(query, options);
        } else if (!(query instanceof registry.Script)
            && !(query instanceof AbstractStmt)
            && !(query instanceof registry.MYSetStmt)
            && !(query instanceof registry.PGSetStmt)) {
            throw new TypeError('query must be a string or an instance of Script | AbstractStmt');
        }
        if (query instanceof registry.Script && query.length === 1) {
            query = query.entries()[0];
        }

        // Return if query is a set statement or a standard statement
        if (query instanceof registry.MYSetStmt
            || query instanceof registry.PGSetStmt
            || query instanceof registry.StdStmt
        ) return query;

        // Determine by heuristics if desugaring needed
        if ((query instanceof registry.DDLStmt && !query.returningClause?.()) // Desugaring not applicable
            || query.originSchemas?.()?.length // Desugaring already done
        ) return query;

        // Schema inference...
        const relationSelector = {};
        let anyFound = false;
        query.walkTree((v, k, scope) => {
            if (v instanceof registry.MYSetStmt
                || v instanceof registry.PGSetStmt
                || v instanceof registry.StdStmt
            ) return;
            if (v instanceof registry.DDLStmt
                && !v.returningClause?.()) return;
            if (v instanceof registry.CTEItem) {
                const alias = v.alias()?._get('delim')
                    ? v.alias().value()
                    : v.alias()?.value().toLowerCase();
                scope.set(alias, true);
                return v;
            }
            if ((!(v instanceof registry.TableRef2) || v.parentNode instanceof registry.ColumnIdent)
                && (!(v instanceof registry.TableRef1) || v.parentNode instanceof registry.ColumnRef1)) {
                return v;
            }
            const namespaceName = v.qualifier()?._get('delim')
                ? v.qualifier().value()
                : v.qualifier()?.value().toLowerCase() || '*';
            const tableName = v._get('delim')
                ? v.value()
                : v.value().toLowerCase();
            if (namespaceName === '*' && scope.has(tableName)) return;
            if (!(namespaceName in relationSelector)) {
                relationSelector[namespaceName] = [];
            }
            if (!relationSelector[namespaceName].includes(tableName)) {
                relationSelector[namespaceName].push(tableName);
                anyFound = true;
            }
        }, true);

        if (anyFound) await this.schemaInference.provide(relationSelector);

        // DeSugaring...
        return query.deSugar(true, {}, null, this.schemaInference);
    }

    async query(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.resolve(_query, options);
        // Realtime query?
        if (options.live && query.fromClause?.()) {
            return await this.#realtimeClient.query(query, options);
        }
        const result = await this._query(query, options);
        return new Result({ rows: result.rows, rowCount: result.rowCount });
    }

    async cursor(...args) {
        const [_query, options] = normalizeQueryArgs(...args);
        const query = await this.resolve(_query, options);
        return await this._cursor(query, options);
    }

    async showCreate(selector, structured = false) {
        return await this._showCreate(selector, structured);
    }
}