import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { ValuesConstructor } from '../../dml/constructors/ValuesConstructor.js';

export class ValuesTableLiteral extends DDLSchemaMixin(ValuesConstructor) {
        
    /* SYNTAX RULES */

    static get syntaxRules() {
        return { type: 'paren_block', syntax: super.syntaxRules, autoIndent: true };
    }
    
    static get syntaxPriority() { return -1; }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy({ ...options, deSugar: options.deSugar ? Infinity : 0 }, transformer, linkedDb);
        if (options.deSugar) {
            const row1_result_schema = resultJson.entries?.[0]?.result_schema;
            resultJson = {
                ...resultJson,
                result_schema: row1_result_schema?.clone()
            }
        }
        return resultJson;
    }
}