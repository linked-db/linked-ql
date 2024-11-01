import { OffsetClause } from './OffsetClause.js';

export class LimitClause extends OffsetClause {
    static get CLAUSE() { return 'LIMIT'; }
}