import { AbstractDiff } from '../../abstracts/AbstractDiff.js';

export class SchemaDiff extends AbstractDiff {

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                type: ['RenameSchemaAction', 'SetSchemaOptionsAction', 'ResetSchemaOptionsAction'],
                as: 'entries',
                arity: { min: 1 },
                itemSeparator,
            },
        ];
    }
}
