import { AbstractNodeList } from './AbstractNodeList.js';

export class JSONSchema extends AbstractNodeList {
    
    /* SYNTAX RULES */

    static get syntaxRules() {
        return { type: ['JSONSchema', 'NamespaceSchema', 'TableSchema', 'ColumnSchema', 'ColumnRef1'/* result of resolving ColumnRef0 */], as: 'entries', arity: Infinity };
    }
}