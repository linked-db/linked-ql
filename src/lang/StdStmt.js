import { AbstractStmt } from './abstracts/AbstractStmt.js';
import { TokenStream } from './TokenStream.js';

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
        const test = (sql) => (typeof sql === 'string'
            && !/^(\((\s+)?)?(WITH|TABLE|SELECT|DELETE|INSERT|UPDATE|UPSERT|CREATE|DROP|SET)\s+/i.test(sql.trimStart()));
        
        if (sql instanceof TokenStream) {
            const _sql = [];

            if (sql.current()) {
                if (!test(sql.current().value)) return;
                _sql.push(sql.current().value);
            }

            await (async function render(tokenStream) {
                for await (const tok of tokenStream) {
                    if (tok.spaceBefore) _sql.push(tok.spaceBefore);
                    if (tok.value instanceof TokenStream) {
                        const tag = tok.type === 'bracket_block' ? ['{', '}'] : (
                            tok.type === 'bracket_block' ? ['[', ']'] : ['(', ')']
                        );
                        _sql.push(tag[0]);
                        await render(tok.value);
                        _sql.push(tag[1]);
                    } else _sql.push(tok.value);
                    if (tok.value === ';') break;
                }
            })(sql);

            sql = _sql.join('');
        }

        if (!sql || !test(sql)) return;

        return new this({ sql }, { ...options });
    }

    stringify() { return this._get('sql'); }
}