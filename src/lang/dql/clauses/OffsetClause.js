import { LimitClause } from './LimitClause.js';

export class OffsetClause extends LimitClause {
    static get CLAUSE() { return 'OFFSET'; }
}