import { registry } from '../../registry.js';
import { AbstractClassicExpr } from '../AbstractClassicExpr.js';

export class PredicateExpr extends AbstractClassicExpr {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'keyword', as: 'predicate', value: ['EXISTS'] },
            { type: 'ScalarSubquery', as: 'expr' },
        ];
    }

    /* AST API */

    predicate() { return this._get('predicate'); }

    expr() { return this._get('expr'); }

    /* TYPESYS API */

    dataType() { return registry.DataType.fromJSON({ value: 'BOOLEAN' }); }
}
