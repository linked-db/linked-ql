
import AbstractLevel2Constraint from './AbstractLevel2Constraint.js';

export default class UniqueKey extends AbstractLevel2Constraint {

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