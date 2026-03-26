import { AbstractDiff } from '../../abstracts/AbstractDiff.js';

export class IndexDiff extends AbstractDiff {

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                type: ['RenameIndexAction', 'SetIndexSchemaAction'],
                as: 'entries',
                arity: { min: 1 },
                itemSeparator,
            },
        ];
    }
}
