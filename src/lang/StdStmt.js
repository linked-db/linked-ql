import { AbstractStmt } from './abstracts/AbstractStmt.js';

export class StdStmt extends AbstractStmt {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof StdStmt) {
            return super.fromJSON(inputJson, options, callback);
        }
        const { nodeName, ...restJson } = inputJson;
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (Object.keys(restJson).join('') !== 'sql') return;
        if (typeof callback === 'function') {
            return callback(restJson, options);
        }
        return new this(restJson, options);
    }

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        return {
            nodeName: this.NODE_NAME,
            sql: this._get('sql'),
        };
    }

    sql() { return this._get('sql'); }

    static async parse(sql, options = {}) {
        if (typeof sql !== 'string'
            || /^(\((\s+)?)?(WITH|TABLE|SELECT|DELETE|INSERT|UPDATE|UPSERT|CREATE|DROP)\s+/i.test(sql.trimStart())) return;
        return new this({ sql }, { ...options });
    }

    stringify() { return this._get('sql'); }
}