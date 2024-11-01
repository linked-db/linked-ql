import { AbstractAction } from '../../abstracts/AbstractAction.js';

export class Drop extends AbstractAction {
    static get EXPECTED_KINDS() {
		return { CONSTRAINT: ['IDENTITY', 'EXPRESSION', 'DEFAULT', 'NOT_NULL', /* 'NULL', 'AUTO_INCREMENT', 'ON_UPDATE' */], };
	}

	static parse(context, expr) {
		const [ , kindExpr ] = expr.match(new RegExp(`^DROP\\s+(${this.EXPECTED_KINDS.CONSTRAINT.map(s => s.replace(/(?<!AUTO)_/gi, '\\s+')).join('|')})$`, 'i')) || [];
		if (kindExpr) return (new this(context, 'CONSTRAINT', kindExpr.replace(/\s+/, '_').toUpperCase()));
	}

	stringify() { return `DROP ${this.$KIND.replace(/(?<!AUTO)_/gi, ' ') }`; }
}