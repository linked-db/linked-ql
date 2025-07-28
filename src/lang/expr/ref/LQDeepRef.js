import { LQDeepDeepRef } from './LQDeepDeepRef.js';
import { registry } from '../../registry.js';

const {
	LQBackRefConstructor,
	ColumnNameRef,
	TableRef,
} = registry;

export class LQDeepRef extends LQDeepDeepRef {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return [
			{
				syntaxes: [
					[
						{ type: ['ColumnRef', 'LQBackRefConstructor'], as: 'left', peek: [1, 'operator', '~>'] }, // fk ~> col | (fk2 <~ fk1 <~ tbl) ~> col
						{ type: 'operator', value: '~>' },
					],
					[
						{ type: 'ColumnRef', as: 'left', peek: [3, 'operator', '~>'] }, // tbl.fk ~> col | (fk2 <~ fk1 <~ tbl).fk ~> col
						{ type: 'operator', value: '~>' },
					]
				]
			},
			{ type: this._rightType, as: 'right' },
		];
	}

	static get syntaxPriority() { return 1; }

	/* API */

	tableSchema() {
		if (this.left() instanceof LQBackRefConstructor) {
			return this.left().tableSchema();
		}
		return super.tableSchema();
	}

	getOperands() {
		const targetTable_schema = this.tableSchema();
		const keyLeft_ref = this.left().clone({ fullyQualified: true });
		const keyRight_ref = ColumnNameRef.fromJSON({
			value: targetTable_schema.primaryKey().columns()[0]
		});
		const targetTable_ref = TableRef.fromJSON({
			qualifier: targetTable_schema.parentSchema(true).name(),
			value: targetTable_schema.name()
		});
		return {
			table: targetTable_ref,
			left: keyLeft_ref,
			right: keyRight_ref,
		};
	}
}