import { Identifier } from '../../expr/ref/Identifier.js';

export class FromItemAlias extends Identifier {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
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
            {
                type: 'paren_block',
                syntax: { type: 'Identifier', as: 'columns', arity: { min: 1 }, itemSeparator, assert: true },
                if: 'value',
                optional: true,
                optionalParens: true,
            }
        ];
    }

    /* AST API */

    asKW() { return this._get('as_kw'); }

    columns() { return this._get('columns'); }

    // --------------

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let resultJson = super.jsonfy(options, transformer, schemaInference);
        if ((options.deSugar === true || options.deSugar?.normalizeCasing) && !resultJson.delim) {
            resultJson = { ...resultJson, value: resultJson.value.toLowerCase() };
        }
        return resultJson;
    }
}