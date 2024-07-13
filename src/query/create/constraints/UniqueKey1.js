
import AbstractConstraint from './AbstractConstraint.js';

export default class UniqueKey1 extends AbstractConstraint {

    /**
     * @returns String
     */
    stringify() { return `${ this.stringifyName() }UNIQUE`; }

    /**
     * @returns Object
     */
    static parse(context, expr) {
        const { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !/^UNIQUE(\s+KEY)?$/i.test($expr)) return;
		return (new this(context)).name(name);
    }
}