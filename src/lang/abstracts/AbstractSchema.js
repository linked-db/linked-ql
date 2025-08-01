import { registry } from '../registry.js';
import { AbstractNodeList } from './AbstractNodeList.js';

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

    /* JSON + TRANSFORM API */

    jsonfy({ renameTo, ...options } = {}, transformCallback = null, linkedDB = null) {
        const resultJson = super.jsonfy(options, transformCallback, linkedDB);
        if (renameTo) {
            if (!(renameTo instanceof registry.Identifier)) {
                throw new Error(`options.renameTo must be an Identifier instance.`);
            }
            return { ...resultJson, name: renameTo.jsonfy() };
        }
        return resultJson;
    }
}