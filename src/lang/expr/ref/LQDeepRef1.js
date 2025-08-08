import { LQDeepDeepRef1 } from './LQDeepDeepRef1.js';
import { registry } from '../../registry.js';

export class LQDeepRef1 extends LQDeepDeepRef1 {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return [
			{
				syntaxes: [
					[
						{ type: ['ColumnRef1', 'LQBackRefAbstraction'], as: 'left', peek: [1, 'operator', '~>'] }, // fk ~> col | (fk2 <~ fk1 <~ tbl) ~> col
						{ type: 'operator', value: '~>' },
					],
					[
						{ type: 'ColumnRef1', as: 'left', peek: [3, 'operator', '~>'] }, // tbl.fk ~> col | (fk2 <~ fk1 <~ tbl).fk ~> col
						{ type: 'operator', value: '~>' },
					]
				]
			},
			{ type: this._rightType, as: 'right' },
		];
	}

	static get syntaxPriority() { return 1; }

	/* API */

	rhsTable(linkedContext, linkedDb) {
		if (this.left() instanceof registry.LQBackRefAbstraction) {
			return this.left().expr()/* LQBackRef */.rhsTable(linkedContext, linkedDb);
		}
		return super.rhsTable(linkedContext, linkedDb);
	}

	resolve(linkedContext, linkedDb) {
		if (!linkedContext || !linkedDb) return;

		let detail;
		if (this.right() instanceof registry.ColumnRef2) {
			detail = registry.ColumnRef1.fromJSON(this.right().jsonfy({ nodeNames: false }));
		} else if (this.right() instanceof registry.LQDeepDeepRef1) {
			detail = registry.LQDeepRef1.fromJSON({
				left: this.right().left().jsonfy({ nodeNames: this.right().left() instanceof registry.ColumnRef2 ? false : true }),
				right: this.right().right().jsonfy()
			});
		} else {
			detail = this.right();
		}

		if (this.left() instanceof registry.LQBackRefAbstraction) {
			const resolution = this.left().expr().resolve(linkedContext, linkedDb);
			return { ...resolution, detail };
		}

		const qualifiedLeftOperand = this.left().resolve(linkedContext, linkedDb);

		const qualifiedRightTable = this.rhsTable(linkedContext, linkedDb);

		const unqualifiedRightOperand = qualifiedRightTable.pkConstraint(true)?.columns()[0]?.resolve();
		if (!unqualifiedRightOperand) throw new Error(`[${this.parentNode || this}] The referenced RHS table ${qualifiedRightTable} does not have a primary key.`);

		return {
			lhsOperand: qualifiedLeftOperand,
			rhsOperand: unqualifiedRightOperand,
			rhsTable: qualifiedRightTable,
			detail,
		};
	}
}