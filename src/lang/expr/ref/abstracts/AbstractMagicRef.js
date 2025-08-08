import { ErrorFKInvalid } from './ErrorFKInvalid.js';
import { SugarMixin } from '../../../abstracts/SugarMixin.js';
import { BinaryExpr } from '../../op/BinaryExpr.js';

export class AbstractMagicRef extends SugarMixin(BinaryExpr) {

    rhsTable(linkedContext, linkedDb) {
        const resolveOperand = this.operand()?.resolve(linkedContext, linkedDb);
        const fk = resolveOperand.ddlSchema()/* ColumnSchema */?.fkConstraint(true);
        if (!fk) {
            throw new ErrorFKInvalid(`[${this.parentNode || this}] Column ${this.operand()} is not a foreign key.`);
        }
        return fk.targetTable()?.resolve(null/*linkedContext*/, linkedDb);
    }

	rhsSchema(linkedContext, linkedDb) { return this.rhsTable(linkedContext, linkedDb)?.ddlSchema(); }
    
}