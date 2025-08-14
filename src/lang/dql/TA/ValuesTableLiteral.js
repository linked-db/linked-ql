import { ValuesConstructor } from '../../dml/constructors/ValuesConstructor.js';

export class ValuesTableLiteral extends ValuesConstructor {
    
    /* SYNTAX RULES */

    static get syntaxRules() {
        return { type: 'paren_block', syntax: super.syntaxRules, autoIndent: true };
    }
}