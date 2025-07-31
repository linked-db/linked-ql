import { AbstractNodeList } from '../../../abstracts/AbstractNodeList.js';

export class PGIndexParameters extends AbstractNodeList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['PGIndexParamInclude', 'PGIndexParamUsing', 'PGIndexParamWith'], as: 'entries', arity: Infinity, singletons: true },
        ];
    }
}