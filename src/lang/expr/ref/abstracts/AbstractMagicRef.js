import { ErrorFKInvalid } from './ErrorFKInvalid.js';
import { SugarMixin } from '../../../abstracts/SugarMixin.js';
import { BinaryExpr } from '../../op/BinaryExpr.js';

export class AbstractMagicRef extends SugarMixin(BinaryExpr) {

    rhsTable(transformer, schemaInference) {
        const resolveOperand = this.operand()?.resolve(transformer, schemaInference);
        const fk = resolveOperand.resultSchema()/* ColumnSchema */?.fkConstraint(true);
        if (!fk) {
            throw new ErrorFKInvalid(`[${this.parentNode || this}] Column ${this.operand()} is not a foreign key.`);
        }
        return fk.targetTable()?.resolve(null/*transformer*/, schemaInference);
    }

	rhsSchema(transformer, schemaInference) { return this.rhsTable(transformer, schemaInference)?.resultSchema(); }
}