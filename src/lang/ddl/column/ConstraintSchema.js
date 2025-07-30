import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class ConstraintSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'Identifier', as: 'name' },
        ];
    }
}