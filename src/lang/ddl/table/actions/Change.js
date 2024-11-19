import { Modify } from './Modify.js';
import { AbstractReferenceMixin } from '../../abstracts/AbstractReferenceMixin.js';

export class Change extends AbstractReferenceMixin(Modify) {
	static parse(context, expr, parseCallback) {
		return super.parse(context, expr, parseCallback, (instance, argumentExpr, Types) => {
			const [$referenceExpr, $argumentExpr] = Lexer.split(argumentExpr, ['\\s+'], { useRegex: true, limit: 1 });
			instance.reference(parseCallback(instance, $referenceExpr, this.REF_TYPES[instance.KIND]));
			return parseCallback(instance, $argumentExpr, Types);
		});
	}

	stringify() { return super.stringify().replace(this.KIND, `${this.KIND} ${this.reference()}`); }
}