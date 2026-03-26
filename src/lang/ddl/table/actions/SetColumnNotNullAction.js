import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class SetColumnNotNullAction extends AbstractNode {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof SetColumnNotNullAction) return super.fromJSON(inputJson, options, callback);
        const { nodeName } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        return new this({}, options);
    }

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'SET' },
            { type: 'operator', value: 'NOT' },
            { type: 'null_literal', value: 'NULL' },
        ];
    }

    operationKind() { return 'SET NOT NULL'; }
}
