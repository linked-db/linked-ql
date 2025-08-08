import { AbstractClassicExpr } from '../AbstractClassicExpr.js';
import { registry } from '../../registry.js';

export class UnaryExpr extends AbstractClassicExpr {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'operator', as: 'operator', value: ['-', '+', 'NOT'] },
            { type: 'Expr', as: 'operand', autoSpacing: ['NOT'] },
        ];
    }

    static get syntaxPriority() { return 1;/* higher than BinaryExpr */ }

    /* AST API */

    operator() { return this._get('operator'); }

    operand() { return this._get('operand'); }

    /* TYPESYS API */

    dataType() {
        const operator = this.operator();
        if (!operator) return super.dataType();
        return registry.DataType.fromJSON({ value: operator === 'NOT' ? 'BOOLEAN' : 'NUMBER' });
    }
}