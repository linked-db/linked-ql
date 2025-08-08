import { RowConstructor } from './RowConstructor.js';

export class TypedRowConstructor extends RowConstructor {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ROW' },
            ...[].concat(super.syntaxRules)
        ];
    }

    static get syntaxPriority() { return 52; } // Above CallExpr
}