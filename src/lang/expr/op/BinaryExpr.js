import { AbstractClassicExpr } from '../AbstractClassicExpr.js';
import { operators } from '../../toktypes.js';
import { registry } from '../../registry.js';

export class BinaryExpr extends AbstractClassicExpr {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'Expr', as: 'left', peek: [1, 'operator', ['NOT', undefined/* IMPORTANT */]] },
            { type: 'operator', as: 'negation', value: 'NOT', booleanfy: true, optional: true },
            { type: 'operator', as: 'operator' },
            { type: 'Expr', as: 'right' },
        ];
    }

    static get syntaxPriority() { return 0; }

    /* AST API */

    left() { return this._get('left'); }

    negation() { return this._get('negation'); }

    operator() { return this._get('operator'); }

    right() { return this._get('right'); }

    /* TYPESYS API */

    dataType() {
        const operator = this.operator();
        if (!operator) return this.left()?.dataType();

        const toDialect = this.options.dialect;
        const operatorMap = new Map(operators.common.concat(operators[toDialect]));
        const resultType = operatorMap.get(operator)?.resultType;
        if (!resultType) return;

        if (resultType === ':right') {
            return this.right()?.dataType();
        }
        if (resultType === ':left') {
            return this.left()?.dataType();
        }
        return registry.DataType.fromJSON({ value: resultType.toUpperCase() });
    }
}