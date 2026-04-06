import { WalEngine as BaseWalEngine } from '../../proc/timeline/WalEngine.js';

export class MainstreamWalEngine extends BaseWalEngine {

    #client;
    get client() { return this.#client; }

    constructor({ client, ...options }) {
        super(options);
        this.#client = client;
    }

    #buildOriginPredicate(event, mvccKey) {
        let sql = event.relation.keyColumns.map((col) => {
            if (!(col in event.old)) throw new TypeError(`Missing value for key field ${col}`);
            return `${this._quoteIdent(col)} = ${this._serializeValue(event.old[col])}`;
        }).join(' AND ');

        if (mvccKey) {
            if (!event.mvccTag) throw new TypeError(`Missing event.mvccTag for the specified mvccKey ${mvccKey}`);
            sql += `${this._quoteIdent(mvccKey)} = ${this._serializeValue(event.mvccTag)}`;
        }
        
        return sql;
    }

    async handleDownstreamCommit(commit) {
        // Steps:
        // begin transaction

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
                WHERE ${this.#buildOriginPredicate(event, commit.mvccKey)}`;
            }

            if (op === 'delete') {
                sql = `
                DELETE FROM ${this._quoteQualifiedRelation(relation)}
                WHERE ${this.#buildOriginPredicate(event, commit.mvccKey)}`;
            }

            if (sql) await this.#client.query(sql, { tx });
        }
    }
}