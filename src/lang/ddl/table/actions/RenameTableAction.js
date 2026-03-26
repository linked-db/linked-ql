import { AbstractNode } from '../../../abstracts/AbstractNode.js';
import { registry } from '../../../registry.js';

export class RenameTableAction extends AbstractNode {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof RenameTableAction) return super.fromJSON(inputJson, options, callback);
        const { nodeName, name } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!name) return;
        return new this({ name: registry.TableIdent.fromJSON(name, options) }, options);
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
            { type: ['TableIdent', 'Identifier'], as: 'name', assert: true },
        ];
    }

    name() { return this._get('name'); }
}
