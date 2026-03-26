import { AbstractDiff } from '../../abstracts/AbstractDiff.js';

export class TableDiff extends AbstractDiff {

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            {
                type: [
                    'RenameTableAction',
                    'SetTableSchemaAction',
                    'AddTableAction',
                    'DropTableAction',
                    'RenameTableItemAction',
                    'AlterColumnAction',
                ],
                as: 'entries',
                arity: { min: 1 },
                itemSeparator,
            },
        ];
    }
}
