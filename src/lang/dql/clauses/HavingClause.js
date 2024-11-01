import { Condition } from '../../expr/logic/Condition.js';

export class HavingClause extends Condition {
    static get CLAUSE() { return 'HAVING'; }
    static get minEntries() { return 1; }
}