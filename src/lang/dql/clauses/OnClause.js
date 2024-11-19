import { Condition } from '../../expr/logic/Condition.js';

export class OnClause extends Condition {
    static get CLAUSE() { return 'ON'; }
    static get minEntries() { return 1; }
}