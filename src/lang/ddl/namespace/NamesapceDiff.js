import { AbstractDiff } from '../../abstracts/AbstractDiff.js';

export class NamesapceDiff extends AbstractDiff {

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                type: ['RenameSchemaAction', 'OptionsSetClause', 'OptionsResetClause'],
                as: 'entries',
                arity: { min: 1 },
                itemSeparator,
            },
        ];
    }
}
