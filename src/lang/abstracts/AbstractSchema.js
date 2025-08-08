import { AbstractNodeList } from './AbstractNodeList.js';
import { registry } from '../registry.js';
import { AbstractNode } from './AbstractNode.js';

export class AbstractSchema extends AbstractNodeList {

    /* AST API */

    name() { return this._get('name'); }

    /* API */

    identifiesAs(value, ...args) {
        return this.name()?.identifiesAs(
            value instanceof AbstractSchema ? value.name() : value,
            ...args
        );
    }

    /* JSON API */

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof AbstractNode) {
            return super.fromJSON(inputJson, options, callback);
        }
        const { ddl_name, ...restJson } = inputJson;
        const node = super.fromJSON(restJson, options, callback);
        if (ddl_name && node) {
            const iddlNameIdent = [registry.SchemaIdent, registry.TableIdent, registry.ColumnIdent].reduce((prev, Class) => prev || Class.fromJSON(ddl_name), null);
            node._set('ddl_name', iddlNameIdent);
        }
        return node;
    }

    jsonfy({ renameTo, ...options } = {}, linkedContext = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, linkedContext, linkedDb);
        if (renameTo) {
            if (!(renameTo instanceof registry.Identifier)) {
                throw new Error(`options.renameTo must be an Identifier instance.`);
            }
            if (resultJson.name?.value && !resultJson.ddl_name) {
                resultJson = { ...resultJson, ddl_name: resultJson.name };
            }
            return { ...resultJson, name: renameTo.jsonfy(options) };
        }
        return resultJson;
    }
}