import { AbstractAction } from './AbstractAction.js';
import { AbstractReferenceMixin } from './AbstractReferenceMixin.js';
import { AbstractArgumentMixin } from './AbstractArgumentMixin.js';

export class AbstractRenameAction extends AbstractReferenceMixin(AbstractArgumentMixin(AbstractAction)) {

	static get EXPECTED_TYPES() { return this.REF_TYPES; }
	
	static parse(context, expr, parseCallback) {
		const [, kindExpr, referenceExpr, argumentExpr ] = expr.match(new RegExp(`^RENAME\\s+(?:(${Object.keys(this.REF_TYPES).join('|')})\\s+)?(?:([\\s\\S]+?)\\s+)?(?:TO|AS)\\s+([\\s\\S]+)$`, 'i')) || [];
		if (!argumentExpr) return;
		const instance = new this(context, referenceExpr && kindExpr.toUpperCase());
		if (referenceExpr) {
			instance.reference(parseCallback(instance, referenceExpr, this.REF_TYPES[instance.KIND]));
			instance.argument(parseCallback(instance, argumentExpr, this.EXPECTED_TYPES[instance.KIND]));
		} else instance.argument(parseCallback(instance, argumentExpr, [this.OWN_REF_TYPE]));
		return instance;
	}

	stringify() {
		return ['RENAME', this.KIND, this.reference(), 'TO', this.argument()].filter(s => s).join(' ');
	}
}