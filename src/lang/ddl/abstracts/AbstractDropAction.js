import { AbstractAction } from './AbstractAction.js';
import { AbstractReferenceMixin } from './AbstractReferenceMixin.js';

export class AbstractDropAction extends AbstractReferenceMixin(AbstractAction) {

	static parse(context, expr, parseCallback) {
		const KINDS = Object.keys(this.EXPECTED_KINDS);
		const [, kindExp, ifExists, referenceExpr, restrictCascadeForce ] = expr.match(new RegExp(`^DROP\\s+(?:(${KINDS.map(s => s.replace(/_/gi, '\\s+')).join('|')})\\s+(IF\\s+EXISTS\\s+)?)?([\\s\\S]+?)(?:\\s+(RESTRICT|CASCADE|FORCE))?$`, 'i')) || [];
		if (!kindExp) return;
		const instance = new this(context, kindExp.replace(/\s+/g, '_').toUpperCase());
		if (ifExists) instance.withFlag('IF_EXISTS');
		if (restrictCascadeForce) instance.withFlag(restrictCascadeForce);
		if (referenceExpr) instance.reference(parseCallback(instance, referenceExpr, this.REF_TYPES[instance.KIND]));
		return instance;
	}

	stringify() {
		const sql = ['DROP', this.KIND];
		if (this.hasFlag('IF_EXISTS')) sql.push('IF EXISTS');
		if (this.reference()) sql.push(this.reference());
		if (this.hasFlag('RESTRICT')) sql.push('RESTRICT');
		else if (this.hasFlag('CASCADE')) sql.push('CASCADE');
		else if (this.hasFlag('FORCE')) sql.push('FORCE');
		return sql.join(' ');
	}
}