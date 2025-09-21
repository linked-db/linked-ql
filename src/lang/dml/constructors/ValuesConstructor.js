import { ResultSchemaMixin } from '../../abstracts/ResultSchemaMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class ValuesConstructor extends ResultSchemaMixin(AbstractNodeList) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntaxes: [
                [
                    { type: 'keyword', value: 'VALUES' },
                    { type: ['TypedRowConstructor', 'RowConstructor'], as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 }
                ],
                {
                    dialect: 'mysql',
                    syntax: [
                        { type: 'keyword', value: ['VALUES', 'VALUE'] },
                        { type: ['TypedRowConstructor', 'RowConstructor'], as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 }
                    ]
                },
            ],
        };
    }

    static get syntaxPriority() { return -1; }

    /* JSON API */

    jsonfy(options = {}, transformer = null, dbContext = null) {
        let resultJson = super.jsonfy({ ...options, forceDeSugar: options.deSugar }, transformer, dbContext);
        if (options.deSugar) {
            const row1_resultSchema = resultJson.entries?.[0]?.result_schema;
            resultJson = {
                ...resultJson,
                result_schema: row1_resultSchema?.clone()
            }
        }
        return resultJson;
    }
}