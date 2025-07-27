import { SetConstructor } from './SetConstructor.js';

export class RowConstructor extends SetConstructor {
        
    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ROW' },
            ...[].concat(super.syntaxRules)
        ];
    }
}