import { ErrorFKInvalid } from './ErrorFKInvalid.js';
import { SugarMixin } from '../../../abstracts/SugarMixin.js';
import { BinaryExpr } from '../../op/BinaryExpr.js';

export class AbstractMagicRef extends SugarMixin(BinaryExpr) {

    rhsTable(transformer, dbContext) {
        const resolveOperand = this.operand()?.resolve(transformer, dbContext);
        const fk = resolveOperand.resultSchema()/* ColumnSchema */?.fkConstraint(true);
        if (!fk) {
            throw new ErrorFKInvalid(`[${this.parentNode || this}] Column ${this.operand()} is not a foreign key.`);
        }
        return fk.targetTable()?.resolve(null/*transformer*/, dbContext);
    }

	rhsSchema(transformer, dbContext) { return this.rhsTable(transformer, dbContext)?.resultSchema(); }
}