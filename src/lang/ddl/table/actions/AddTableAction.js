import { AbstractNode } from '../../../abstracts/AbstractNode.js';
import { registry } from '../../../registry.js';

export class AddTableAction extends AbstractNode {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof AddTableAction) return super.fromJSON(inputJson, options, callback);
        const { nodeName, kind, column_kw, name, argument } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!argument) return;
        const ArgumentClass = Object.values(registry).find(NodeClass => NodeClass?.NODE_NAME === argument.nodeName);
        if (!ArgumentClass?.fromJSON) return;
        const json = {
            argument: ArgumentClass.fromJSON(argument, options),
        };
        if (kind) json.kind = kind;
        if (column_kw) json.column_kw = column_kw;
        if (name) json.name = registry.Identifier.fromJSON(name, options);
        return new this(json, options);
    }

    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    { type: 'keyword', value: 'ADD' },
                    { type: 'identifier', value: 'ADD' },
                ],
            },
            {
                syntaxes: [
                    [
                        { type: 'keyword', as: 'column_kw', value: 'COLUMN', booleanfy: true },
                        { type: 'ColumnSchema', as: 'argument', assert: true },
                    ],
                    [
                        { type: 'keyword', as: 'kind', value: 'CONSTRAINT' },
                        { type: 'Identifier', as: 'name', assert: true },
                        { type: ['TablePKConstraint', 'TableFKConstraint', 'TableUKConstraint', 'CheckConstraint'], as: 'argument', assert: true },
                    ],
                    [
                        { type: 'IndexSchema', as: 'argument', dialect: 'mysql', peek: [0, 'keyword', ['INDEX', 'KEY']] },
                    ],
                    [
                        { type: 'IndexSchema', as: 'argument', dialect: 'mysql', peek: [1, 'keyword', ['INDEX', 'KEY']] },
                    ],
                    [
                        { type: ['TablePKConstraint', 'TableFKConstraint', 'TableUKConstraint', 'CheckConstraint'], as: 'argument' },
                    ],
                    [
                        { type: 'ColumnSchema', as: 'argument', assert: true },
                    ],
                ],
            },
        ];
    }

    kind() { return this._get('kind'); }

    columnKW() { return this._get('column_kw'); }

    name() { return this._get('name'); }

    argument() { return this._get('argument'); }
}
