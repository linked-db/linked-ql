import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class SetViewSchemaAction extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'SET' },
            { type: 'keyword', value: 'SCHEMA' },
            { type: ['NamespaceIdent', 'Identifier'/* to support mock names */], as: 'schema', assert: true },
        ];
    }

    /* AST API */

    schema() { return this._get('schema'); }
}
