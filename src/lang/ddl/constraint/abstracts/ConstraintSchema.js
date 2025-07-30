import { AbstractSchema } from '../../../abstracts/AbstractSchema.js';

export class ConstraintSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static buildSyntaxRules(rules) {
        return [
            {
                optional: true,
                syntax: [
                    { type: 'keyword', value: 'CONSTRAINT' },
                    { type: 'Identifier', as: 'name', assert: true },
                ]
            },
            ...
            rules
        ];
    }
}