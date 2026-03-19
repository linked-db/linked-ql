import { registry } from '../registry.js';
import { AbstractNodeList } from './AbstractNodeList.js';

export class JSONSchema extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return { type: ['JSONSchema', 'NamespaceSchema', 'TableSchema', 'ColumnSchema', 'ColumnRef1'/* result of resolving ColumnRef0 */], as: 'entries', arity: Infinity };
    }

    /* API */

    columns() {
        const result = [];
        for (const entry of this) {
            if (!(entry instanceof registry.ColumnSchema)) continue;
            result.push(entry);
        }
        return result;
    }
}