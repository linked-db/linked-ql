import { Identifier } from '../expr/ref/Identifier.js';

export class BasicAlias extends Identifier {
    static get syntaxRules() {
        return [
            ...[].concat(super.syntaxRules),
            { type: 'AggrNotation', as: 'is_aggr', autoSpacing: false, optional: true },
        ];
    }

    /* AST API */

    isAggr() { return this._get('is_aggr'); }
}