import { AbstractAction } from '../../abstracts/AbstractAction.js';
import { AbstractArgumentMixin } from '../../abstracts/AbstractArgumentMixin.js';
import { IdentityConstraint } from '../../constraints/IdentityConstraint.js';

export class Add extends AbstractArgumentMixin(AbstractAction) {
	static get EXPECTED_TYPES() {
		return { CONSTRAINT: [IdentityConstraint] };
	}

	get $KIND() { return this.argument()?.TYPE; }

	static parse(context, expr, parseCallback) {
		const [ , argumentExpr ] = expr.match(/^ADD\s+([\s\S]+)$/i) || [];
		if (argumentExpr) {
			const instance = new this(context, 'CONSTRAINT');
			return instance.argument(parseCallback(instance, argumentExpr, this.EXPECTED_TYPES.CONSTRAINT));
		}
	}
}