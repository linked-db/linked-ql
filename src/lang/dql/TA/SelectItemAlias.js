import { Identifier } from '../../expr/ref/Identifier.js';

export class SelectItemAlias extends Identifier {
    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    { ...[].concat(super.syntaxRules)[0] },
                    [
                        { type: 'keyword', as: 'as_kw', value: 'AS', booleanfy: true },
                        { ...[].concat(super.syntaxRules)[0], assert: true },
                    ]
                ]
            },
            { type: 'AggrNotation', as: 'is_aggr', autoSpacing: false, optional: true },
        ];
    }

    /* AST API */

    asKW() { return this._get('as_kw'); }

    isAggr() { return this._get('is_aggr'); }
}