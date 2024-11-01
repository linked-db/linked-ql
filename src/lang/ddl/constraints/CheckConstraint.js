import { AbstractLevel2Constraint } from './abstracts/AbstractLevel2Constraint.js';
import { AbstractExprConstraint } from './abstracts/AbstractExprMixin.js';

export class CheckConstraint extends AbstractExprConstraint(AbstractLevel2Constraint) {

    #columns = [];

    columns() {
        if (arguments.length) throw new Error(`The "columns" attributes for CHECK constraints is implicit.`);
        return this.#columns;
    }
}