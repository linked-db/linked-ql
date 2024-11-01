import { AbstractAction } from './AbstractAction.js';
import { AbstractReferenceMixin } from './AbstractReferenceMixin.js';
import { AbstractArgumentMixin } from './AbstractArgumentMixin.js';

export class AbstractAlterAction extends AbstractReferenceMixin(AbstractArgumentMixin(AbstractAction)) {
 
	static parse(context, expr, parseCallback) {
		const [, kindExpr, referenceExpr, argumentExpr ] = expr.match(new RegExp(`^ALTER\\s+(?:(${Object.keys(this.EXPECTED_TYPES).join('|')})\\s+)?([\\s\\S]+?)\\s+([\\s\\S]+)$`, 'i')) || [];
		if (!referenceExpr) return;
		const instance = new this(context, kindExpr.toUpperCase());
		instance.reference(parseCallback(instance, referenceExpr, this.REF_TYPES[instance.KIND]));
		instance.argument(parseCallback(instance, argumentExpr, this.EXPECTED_TYPES[instance.KIND]));
		return instance;
	}
}