import { ValuesClause } from './ValuesClause.js';

export class ValuesSubClause extends ValuesClause {
    static get TAGS() { return ['(', ')']; }
}