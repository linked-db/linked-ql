import { AbstractAction } from './AbstractAction.js';
import { AbstractArgumentMixin } from './AbstractArgumentMixin.js';

export class AbstractCreateAction extends AbstractArgumentMixin(AbstractAction) {

	static parse(context, expr, parseCallback) {
		const [, kindExpr, ifNotExists, argumentExpr] = expr.match(new RegExp(`^${this.CLAUSE}\\s+(${Object.keys(this.EXPECTED_TYPES).join('|')})\\s+(IF\\s+NOT\\s+EXISTS\\s+)?([\\s\\S]+)$`, 'i')) || [];
		if (!kindExpr) return;
		const instance = new this(context, kindExpr.toUpperCase());
		if (ifNotExists) instance.withFlag('IF_NOT_EXISTS');
		const argument = parseCallback(instance, argumentExpr, this.EXPECTED_TYPES[instance.KIND]);
		return instance.argument(argument);
	}

	stringify() {
		const sql = ['CREATE', this.KIND];
		if (this.hasFlag('IF_NOT_EXISTS')) sql.push('IF NOT EXISTS');
		sql.push(this.argument());
		return sql.join(' ');
	}
}