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

	rhsTable(transformer, linkedDb) {
		if (this.left()?.qualifier?.() instanceof registry.LQBackRefAbstraction) {
			return this._normalize().rhsTable(transformer, linkedDb);
		}
		if (this.left() instanceof registry.LQBackRefAbstraction) {
			return this.left().expr()/* LQBackRef */.rhsTable(transformer, linkedDb);
		}
		return super.rhsTable(transformer, linkedDb);
	}

	_normalize() {
		const left = this.left();
		const right = this.right();
		const lhsOperandJson = left.qualifier().jsonfy();
		const rhsOperandJson = { ...left.jsonfy(), qualifier: undefined, nodeName: registry.ColumnRef2.NODE_NAME };
		const deepRef = LQDeepRef1.fromJSON({
			left: lhsOperandJson,
			right: { nodeName: LQDeepDeepRef1.NODE_NAME, left: rhsOperandJson, right: right.jsonfy() }
		});
		this._adoptNodes(deepRef);
		return deepRef;
	}

	resolve(transformer, linkedDb) {
		if (!transformer || !linkedDb) return;
		if (this.left()?.qualifier?.() instanceof registry.LQBackRefAbstraction) {
			return this._normalize().resolve(transformer, linkedDb);
		}

		let detail;
		if (this.right() instanceof registry.ColumnRef2) {
			detail = registry.ColumnRef1.fromJSON(this.right().jsonfy({ nodeNames: false }));
		} else if (this.right() instanceof registry.LQDeepDeepRef1) {
			detail = this.right().clone({ toDeepRef: true });
		} else {
			detail = this.right();
		}

		if (this.left() instanceof registry.LQBackRefAbstraction) {
			const resolution = this.left().expr().resolve(transformer, linkedDb);
			return { ...resolution, detail };
		}

		const qualifiedLeftOperand = this.left().resolve(transformer, linkedDb);

		const qualifiedRightTable = this.rhsTable(transformer, linkedDb);

		const unqualifiedRightOperand = qualifiedRightTable.resultSchema().pkConstraint(true)?.columns()[0]?.resolve(transformer, linkedDb);
		if (!unqualifiedRightOperand) throw new Error(`[${this.parentNode || this}] The referenced RHS table ${qualifiedRightTable} does not have a primary key.`);

		return {
			lhsOperand: qualifiedLeftOperand, // ColumnRef1
			rhsOperand: unqualifiedRightOperand, // ColumnRef2
			rhsTable: qualifiedRightTable, // TableRef2
			detail,
		};
	}
}