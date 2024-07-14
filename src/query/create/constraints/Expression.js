
import AbstractExpr from './AbstractExpr.js';

export default class Expression extends AbstractExpr {

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