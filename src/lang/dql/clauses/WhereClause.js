import { Condition } from '../../expr/logic/Condition.js';

export class WhereClause extends Condition {
    static get CLAUSE() { return 'WHERE'; }
    static get minEntries() { return 1; }
}