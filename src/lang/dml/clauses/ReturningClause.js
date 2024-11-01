import { FieldsSpec } from '../../dql/clauses/FieldsSpec.js';

export class ReturningClause extends FieldsSpec {
    static get CLAUSE() { return 'RETURNING'; }
}