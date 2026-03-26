import { AbstractNode } from '../../../abstracts/AbstractNode.js';
import { registry } from '../../../registry.js';

export class RenameTableItemAction extends AbstractNode {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof RenameTableItemAction) return super.fromJSON(inputJson, options, callback);
        const { nodeName, column_kw, index_kw, old_name, name } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!old_name || !name) return;
        const OldNameClass = Object.values(registry).find(NodeClass => NodeClass?.NODE_NAME === old_name.nodeName);
        const NameClass = Object.values(registry).find(NodeClass => NodeClass?.NODE_NAME === name.nodeName);
        if (!OldNameClass?.fromJSON || !NameClass?.fromJSON) return;
        return new this({
            ...(column_kw ? { column_kw } : {}),
            ...(index_kw ? { index_kw } : {}),
            old_name: OldNameClass.fromJSON(old_name, options),
            name: NameClass.fromJSON(name, options),
        }, options);
    }

    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    { type: 'keyword', value: 'RENAME' },
                    { type: 'identifier', value: 'RENAME', dialect: 'postgres' },
                ],
            },
            {
                assert: true,
                syntaxes: [
                    { type: 'keyword', as: 'column_kw', value: 'COLUMN', booleanfy: true },
                    { type: 'keyword', as: 'index_kw', value: ['INDEX', 'KEY'], dialect: 'mysql' },
                ],
            },
            { type: ['ColumnIdent', 'IndexIdent', 'Identifier'], as: 'old_name', assert: true },
            { type: 'keyword', value: 'TO' },
            { type: ['ColumnIdent', 'IndexIdent', 'Identifier'], as: 'name', assert: true },
        ];
    }

    columnKW() { return this._get('column_kw'); }

    indexKW() { return this._get('index_kw'); }

    oldName() { return this._get('old_name'); }

    name() { return this._get('name'); }
}
