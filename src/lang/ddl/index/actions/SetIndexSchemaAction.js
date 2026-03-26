import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class SetIndexSchemaAction extends AbstractNode {

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'SET' },
            { type: 'keyword', value: 'SCHEMA' },
            { type: ['NamespaceIdent', 'Identifier'], as: 'schema', assert: true },
        ];
    }

    schema() { return this._get('schema'); }
}
