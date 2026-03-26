import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class DropTableAction extends AbstractNode {

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'DROP' },
            {
                assert: true,
                syntaxes: [
                    { type: 'keyword', as: 'column_kw', value: 'COLUMN', booleanfy: true },
                    { type: 'keyword', as: 'constraint_kw', value: 'CONSTRAINT', booleanfy: true },
                    { type: 'keyword', as: 'index_kw', value: ['INDEX', 'KEY'], dialect: 'mysql' },
                ],
            },
            { type: ['ColumnIdent', 'IndexIdent', 'Identifier'], as: 'name', assert: true },
            { type: 'keyword', as: 'cascade_rule', value: ['CASCADE', 'RESTRICT'], optional: true, dialect: 'postgres' },
        ];
    }

    columnKW() { return this._get('column_kw'); }

    constraintKW() { return this._get('constraint_kw'); }

    indexKW() { return this._get('index_kw'); }

    name() { return this._get('name'); }

    cascadeRule() { return this._get('cascade_rule'); }
}
