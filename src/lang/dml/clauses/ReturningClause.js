import { SelectList } from '../../dql/clauses/SelectList.js';

export class ReturningClause extends SelectList {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'RETURNING' },
            ...[].concat(super.syntaxRules),
        ];
    }
}