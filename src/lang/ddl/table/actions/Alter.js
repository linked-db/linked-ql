import { AbstractAction } from '../../abstracts/AbstractAction.js';
import { AbstractArgumentMixin } from '../../abstracts/AbstractArgumentMixin.js';
import { AbstractReferenceMixin } from '../../abstracts/AbstractReferenceMixin.js';
import { ColumnCDL } from '../../column/ColumnCDL.js';
import { ConstraintCDL } from '../../constraints/ConstraintCDL.js';
import { IndexCDL } from '../../index/IndexCDL.js';
import { ColumnRef } from '../../../expr/refs/ColumnRef.js';
import { Identifier } from '../../../expr/Identifier.js';
import { Lexer } from '../../../Lexer.js';

export class Alter extends AbstractReferenceMixin(AbstractArgumentMixin(AbstractAction)) {
	static get EXPECTED_TYPES() {
        return {
            COLUMN: [ColumnCDL],
            CONSTRAINT: [ConstraintCDL],
			INDEX: [IndexCDL],
        };
    }

    static get REF_TYPES() {
        return {
            COLUMN: [ColumnRef],
            CONSTRAINT: [Identifier],
			INDEX: [Identifier],
        };
    }

	static parse(context, expr, parseCallback) {
		const [, kindExpr = 'COLUMN', restExpr ] = expr.match(new RegExp(`^ALTER\\s+(?:(${Object.keys(this.EXPECTED_TYPES).join('|')})\\s+)?([\\s\\S]+)$`, 'i')) || [];
		const [ referenceExpr, argumentExpr ] = Lexer.split(restExpr, [' '], { limit: 1 }).map((s) => s.trim());
		if (!argumentExpr) return;
		const instance = new this(context, kindExpr.toUpperCase());
		instance.reference(parseCallback(instance, referenceExpr, this.REF_TYPES[instance.KIND]));
		instance.argument(parseCallback(instance, argumentExpr, this.EXPECTED_TYPES[instance.KIND]));
		return instance;
	}

	stringify() {
		return [...this.argument()].map(action => {
			return `ALTER ${this.KIND} ${this.reference()} ${action}`;
		}).join('\n');
	}
}