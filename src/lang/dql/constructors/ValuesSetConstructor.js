import { ValuesConstructor } from './ValuesConstructor.js';

export class ValuesSetConstructor extends ValuesConstructor {
        
    /* SYNTAX RULES */

    static get syntaxRules() {
        return { type: 'paren_block', syntax: super.syntaxRules, autoIndent: true };
    }
    
    static get syntaxPriority() { return -1; }
}