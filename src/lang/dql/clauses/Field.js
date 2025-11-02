import { AbstractAliasableExpr } from '../../expr/abstracts/AbstractAliasableExpr.js';
import { Exprs } from '../../expr/grammar.js';

export class Field extends AbstractAliasableExpr {
    static get EXPECTED_TYPES() { return Exprs; }
}