import { AbstractSchema } from '../../abstracts/AbstractSchema.js';
import { registry } from '../../registry.js';

export class SchemaSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'SchemaIdent', as: 'name', assert: true },
            {
                type: 'paren_block',
                syntax: { type: 'TableSchema', as: 'entries', arity: { min: 1 }, itemSeparator, singletons: 'BY_KEY', autoIndent: true },
            },
        ];
    }

    /* API */

    tables() {
        const result = [];
        for (const entry of this) {
            if (!(entry instanceof registry.TableSchema)) continue;
            result.push(entry);
        }
        return result;
    }
}