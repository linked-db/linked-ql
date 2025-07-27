import { ParenShape } from '../../expr/shape/ParenShape.js';

export class SubqueryConstructor extends ParenShape {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            type: 'paren_block',
            syntax: { type: ['SelectStmt', 'InsertStmt', 'UpsertStmt', 'UpdateStmt', 'DeleteStmt', 'CTE'], as: 'expr' },
            autoIndent: true,
        };
    }
    
    static get syntaxPriority() { return 51; } // Above SetConstructor
}