import { AbstractNode } from '../../../abstracts/AbstractNode.js';

export class PGIndexParamUsing extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'USING' },
            { type: 'keyword', value: 'INDEX' },
            { type: 'keyword', value: 'TABLESPACE' },
            { type: 'identifier', as: '.' },
        ];
    }
}