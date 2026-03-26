import { AbstractNode } from '../../../abstracts/AbstractNode.js';
import { registry } from '../../../registry.js';

export class AlterColumnAction extends AbstractNode {

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ALTER' },
            { type: 'keyword', value: 'COLUMN', optional: true },
            { type: ['ColumnIdent', 'Identifier'], as: 'name', assert: true },
            { type: ['SetColumnNotNullAction', 'SetColumnDefaultAction', 'DropColumnNotNullAction', 'DropColumnDefaultAction'], as: 'action', assert: true },
        ];
    }

    name() { return this._get('name'); }

    action() { return this._get('action'); }

    operationKind() {
        return this.action()?.operationKind?.();
    }

    expr() {
        const action = this.action();
        if (action instanceof registry.SetColumnDefaultAction) return action.expr();
    }
}
