import { AbstractAction } from '../../abstracts/AbstractAction.js';
import { AbstractArgumentMixin } from '../../abstracts/AbstractArgumentMixin.js';
import { AbstractReferenceMixin } from '../../abstracts/AbstractReferenceMixin.js';
import { GlobalTableRef } from '../../../expr/refs/GlobalTableRef.js';
import { ColumnRef } from '../../../expr/refs/ColumnRef.js';
import { Identifier } from '../../../expr/Identifier.js';

export class Rename extends AbstractReferenceMixin(AbstractArgumentMixin(AbstractAction)) {
    static get REF_TYPES() {
        return {
            COLUMN: [ColumnRef],
            CONSTRAINT: [Identifier],
			INDEX: [Identifier]
        };
    }

	static get EXPECTED_TYPES() { return this.REF_TYPES; }

	static get OWN_REF_TYPE() { return GlobalTableRef; }

	get EXPECTED_TYPES() { return !this.KIND ? this.constructor.OWN_REF_TYPE : this.constructor.EXPECTED_TYPES[this.KIND]; }

	static parse(context, expr, parseCallback) {
		const [, kindExpr = 'COLUMN', referenceExpr, argumentExpr ] = expr.match(new RegExp(`^RENAME\\s+(?:(${Object.keys(this.REF_TYPES).join('|')})\\s+)?(?:([\\s\\S]+?)\\s+)?(?:TO|AS)\\s+([\\s\\S]+)$`, 'i')) || [];
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