import { AbstractNode } from '../../../abstracts/AbstractNode.js';
import { registry } from '../../../registry.js';

export class RenameSchemaAction extends AbstractNode {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof RenameSchemaAction) return super.fromJSON(inputJson, options, callback);
        const { nodeName, name } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!name) return;
        return new this({ name: registry.Identifier.fromJSON(name, options) }, options);
    }

    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    { type: 'keyword', value: 'RENAME' },
                    { type: 'identifier', value: 'RENAME', dialect: 'postgres' },
                ],
            },
            { type: 'keyword', value: 'TO' },
            { type: 'Identifier', as: 'name', assert: true },
        ];
    }

    name() { return this._get('name'); }
}
