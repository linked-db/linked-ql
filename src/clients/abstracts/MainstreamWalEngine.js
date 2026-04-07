import { WalEngine as BaseWalEngine } from '../../proc/timeline/WalEngine.js';
import { ConflictError } from '../../flashql/errors/ConflictError.js';

export class MainstreamWalEngine extends BaseWalEngine {

    #client;
    get client() { return this.#client; }

    constructor({ client, ...options }) {
        super(options);
        this.#client = client;
    }

    _quoteIdent(name) {
        return `"${String(name).replace(/"/g, '""')}"`;
    }

    _quoteQualifiedRelation({ namespace, name }) {
        return namespace
            ? `${this._quoteIdent(namespace)}.${this._quoteIdent(name)}`
            : this._quoteIdent(name);
    }

    _serializeValue(value) {
        if (value === null) return 'NULL';
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new TypeError('Cannot serialize non-finite number');
            return String(value);
        }
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
        return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }

    #buildOriginPredicate(event, mvccKey) {
        let sql = event.relation.keyColumns.map((col) => {
            if (!(col in event.old)) throw new TypeError(`Missing value for key field ${col}`);
            return `${this._quoteIdent(col)} = ${this._serializeValue(event.old[col])}`;
        }).join(' AND ');

        if (mvccKey) {
            if (!event.mvccTag)
                throw new TypeError(`Missing event.mvccTag for the specified mvccKey ${mvccKey}`);
            const mvccExpr = this.#client.dialect === 'postgres' && mvccKey.toUpperCase() === 'XMIN'
                ? `CAST(CAST(${this._quoteIdent(mvccKey)} AS TEXT) AS INT)`
                : this._quoteIdent(mvccKey);
            sql += ` AND ${mvccExpr} = ${this._serializeValue(event.mvccTag)}`;
        }
        
        return sql;
    }

    async applyDownstreamCommit(commit) {
        const applyCommit = async (tx = null) => {
            for (const event of commit.entries) {
                const { op, relation } = event;
                let sql;

                if (op === 'insert') {
                    const entries = Object.entries(event.new);
                    sql = `
                    INSERT INTO ${this._quoteQualifiedRelation(relation)}
                        (${entries.map(([name]) => this._quoteIdent(name)).join(', ')})
                    VALUES (${entries.map(([, value]) => this._serializeValue(value)).join(', ')})`;
                }

                if (op === 'update') {
                    const assignments = Object.entries(event.new)
                        .map(([name, value]) => `${this._quoteIdent(name)} = ${this._serializeValue(value)}`);
                    sql = `
                    UPDATE ${this._quoteQualifiedRelation(relation)}
                    SET ${assignments.join(', ')}
                    WHERE ${this.#buildOriginPredicate(event, relation.mvccKey)}`;
                }

                if (op === 'delete') {
                    sql = `
                    DELETE FROM ${this._quoteQualifiedRelation(relation)}
                    WHERE ${this.#buildOriginPredicate(event, relation.mvccKey)}`;
                }

                if (!sql) continue;

                const result = await this.#client._query(sql, { tx });
                if ((op === 'update' || op === 'delete') && result?.rowCount === 0) {
                    throw new ConflictError(`[${this._quoteQualifiedRelation(relation)}] Origin row version no longer matches the expected version`);
                }
            }
        };

        if (typeof this.#client.transaction === 'function') {
            return await this.#client.transaction(async (tx) => {
                await applyCommit(tx);
            });
        }

        return await applyCommit();
    }
}
