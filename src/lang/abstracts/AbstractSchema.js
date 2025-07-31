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
}