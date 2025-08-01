import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { _eq } from '../../util.js';

export class Identifier extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: 'identifier', as: '.' }; }

    static get syntaxPriority() { return -1; }

    /* AST API */

    value() { return this._get('value'); }

    /* API */

    identifiesAs(ident, cs = undefined) {
        if (ident instanceof Identifier) {
			return _eq(this.value(), ident.value(), cs === undefined ? (this._has('delim') || ident._has('delim')) : cs);
		}
        if (typeof ident === 'string') {
            return _eq(this._get('value'), ident, cs === undefined ? this._has('delim') : cs);
        }
        return super.identifiesAs(ident, cs);
    }
}