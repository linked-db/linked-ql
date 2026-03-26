import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class DropColumnDefaultAction extends AbstractNode {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof DropColumnDefaultAction) return super.fromJSON(inputJson, options, callback);
        const { nodeName } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        return new this({}, options);
    }

    static get syntaxRules() {
        return [
            {
                syntaxes: [
                    { type: 'keyword', value: 'DROP DEFAULT' },
                    [
                        { type: 'keyword', value: 'DROP' },
                        { type: 'keyword', value: 'DEFAULT' },
                    ],
                ],
            },
        ];
    }

    operationKind() { return 'DROP DEFAULT'; }
}
