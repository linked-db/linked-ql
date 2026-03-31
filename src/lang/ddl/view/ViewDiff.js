import { AbstractDiff } from '../../abstracts/AbstractDiff.js';

export class ViewDiff extends AbstractDiff {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                type: ['RenameViewAction', 'SetViewSchemaAction', 'RelationSourceExpr', 'OptionsSetClause', 'OptionsResetClause'],
                as: 'entries',
                arity: { min: 1 },
                itemSeparator,
            },
        ];
    }
}
