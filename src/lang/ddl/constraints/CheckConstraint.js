import { AbstractLevel2Constraint } from './abstracts/AbstractLevel2Constraint.js';
import { AbstractExprMixin } from './abstracts/AbstractExprMixin.js';
import { ColumnRef } from '../../expr/refs/ColumnRef.js';

export class CheckConstraint extends AbstractExprMixin(AbstractLevel2Constraint) {

    $columns() { return this.columns(); }
    
    stringify() { return `${ super.stringifyName() }CHECK (${ this.$expr() })`; }
}