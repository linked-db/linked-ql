import { ErrorFKInvalid } from './ErrorFKInvalid.js';
import { SugarMixin } from '../../../abstracts/SugarMixin.js';
import { BinaryExpr } from '../../op/BinaryExpr.js';

export class AbstractMagicRef extends SugarMixin(BinaryExpr) {

    rhsTable(transformer, linkedDb) {
        const resolveOperand = this.operand()?.resolve(transformer, linkedDb);
        const fk = resolveOperand.resultSchema()/* ColumnSchema */?.fkConstraint(true);
        if (!fk) {
            throw new ErrorFKInvalid(`[${this.parentNode || this}] Column ${this.operand()} is not a foreign key.`);
        }
        return fk.targetTable()?.resolve(null/*transformer*/, linkedDb);
    }

	rhsSchema(transformer, linkedDb) { return this.rhsTable(transformer, linkedDb)?.resultSchema(); }
}