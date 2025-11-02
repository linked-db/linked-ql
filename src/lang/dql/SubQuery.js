import { SelectStatement } from './SelectStatement.js';
import { TableSchema } from '../ddl/table/TableSchema.js';
import { Parens } from '../expr/Parens.js';

export class SubQuery extends Parens {
	static get EXPECTED_TYPES() { return [SelectStatement]; }

	select(...fieldsSpec) { return this.expr({ fieldsSpec }).expr(); }

	static get expose() { return }

	schema() {
		const tblSchema = TableSchema.fromJSON(this, { name: '', columns: [] });
		const columnSchemas = this.expr().schema({ derivationLevel: 'SELECT_LIST_ONLY' })/*DatabaseSchema*/.columns() || [];
		for (const colSchema of columnSchemas) tblSchema.column({ ...colSchema.jsonfy() });
		return tblSchema;
	}
	
	static fromJSON(context, json, callback = null) {
		if (!json?.expr || !json?.expr?.fieldsSpec) return;
		return super.fromJSON(context, json, callback);
	}

	static parse(context, expr, parseCallback) {
		if (!/\(\s*SELECT\s+/i.test(expr)) return;
		return super.parse(context, expr, parseCallback);
	}
}