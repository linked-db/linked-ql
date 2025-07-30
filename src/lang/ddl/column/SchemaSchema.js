import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class SchemaSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'SchemaIdent', as: 'name' },
        ];
    }
}