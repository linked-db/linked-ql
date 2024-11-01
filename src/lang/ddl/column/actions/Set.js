import { AbstractAction } from '../../abstracts/AbstractAction.js';
import { AbstractArgumentMixin } from '../../abstracts/AbstractArgumentMixin.js';
import { IdentityConstraint } from '../../constraints/IdentityConstraint.js';
import { ExpressionConstraint } from '../../constraints/ExpressionConstraint.js';
import { DefaultConstraint } from '../../constraints/DefaultConstraint.js';
import { NotNullConstraint } from '../../constraints/NotNullConstraint.js';
import { DataType } from '../DataType.js';

export class Set extends AbstractArgumentMixin(AbstractAction) {
    static get EXPECTED_TYPES() {
        return {
            DATA_TYPE: [DataType],
            CONSTRAINT: [IdentityConstraint, ExpressionConstraint, DefaultConstraint, NotNullConstraint, /* NullConstraint, AutoIncrementConstraint, OnUpdateConstraint */],
        };
    }

	static parse(context, expr, parseCallback) {
        let [, clauseMatch, restExpr] = (new RegExp(`^(SET|TYPE)\\s+([\\s\\S]+)$`, 'i')).exec(expr) || [];
        if (!clauseMatch) return;
        let subMatch, $KIND, argumentExpr;
        if (subMatch = restExpr.match(/^DATA\s+TYPE\s+([\s\S]+)$/i)) {
            $KIND = 'DATA_TYPE';
            argumentExpr = subMatch[1];
        } else if (/^TYPE$/i.test(clauseMatch)) {
            $KIND = 'DATA_TYPE';
            argumentExpr = restExpr;
        } else if (subMatch = restExpr.match(/^GENERATED\s+([\s\S]+)$/i)) {
            $KIND = 'IDENTITY';
            argumentExpr = `GENERATED ${subMatch[1]} AS IDENTITY`;
        } else if (subMatch = restExpr.match(/^EXPRESSION\s+AS\s+([\s\S]+)$/i)) {
            $KIND = 'EXPRESSION';
            argumentExpr = `GENERATED ALWAYS AS ${subMatch[1]} STORED`;
        } else if (subMatch = restExpr.match(/^(DEFAULT|NOT\s+NULL)[\s\S]+$/i)) {
            $KIND = subMatch[1].replace(/\s+/g, '_').toUpperCase();
            argumentExpr = restExpr;
        } else return;
        const instance = new this(context, $KIND === 'DATA_TYPE' ? $KIND : 'CONSTRAINT', $KIND);
		return instance.argument(parseCallback(instance, argumentExpr, this.EXPECTED_TYPES[instance.KIND]));
	}

    stringify() {
        let kindExpr = this.$KIND.replace(/(?<!AUTO)_/gi, ' ');
        let argumentExpr = this.argument();
        if (this.KIND === 'DATA_TYPE') {
            argumentExpr = `${kindExpr} ${argumentExpr}`;
        } else if (this.$KIND === 'EXPRESSION') {
            argumentExpr = `${kindExpr} AS ${this.argument().$expr()}`;
        } else if (this.$KIND === 'IDENTITY') {
            argumentExpr = `GENERATED ${this.argument().$always() ? 'ALWAYS' : 'BY DEFAULT'}`;
        }
        return `SET ${argumentExpr}`;
    }
}