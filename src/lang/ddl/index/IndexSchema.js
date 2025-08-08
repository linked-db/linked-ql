import { AbstractSchema } from '../../abstracts/AbstractSchema.js';

export class IndexSchema extends AbstractSchema {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'Identifier', as: 'name', assert: true },
        ];
    }
}