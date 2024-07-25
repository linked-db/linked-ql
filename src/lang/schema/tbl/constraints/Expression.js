
import AbstractLevel1Constraint from './AbstractLevel1Constraint.js';
import AbstractExprConstraint from './AbstractExprConstraint.js';

export default class Expression extends AbstractExprConstraint(AbstractLevel1Constraint) {

    /**
     * @returns String
     */
    stringify() { return `GENERATED ALWAYS AS (${ this.expr() })${ this.params.dialect !== 'mysql' ? ` STORED` : '' }`; }

    /**
     * @returns Object
     */
    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
		if (!$expr || !($expr = $expr.match(new RegExp(`^GENERATED\\s+ALWAYS\\s+AS\\s+\\(` + `([\\s\\S]+)` + `\\)(?:\\s+STORED)?$`, 'i'))?.[1])) return;
		return (new this(context)).name(name).expr($expr);
    }
}