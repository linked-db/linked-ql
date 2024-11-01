import { _intersect } from '@webqit/util/arr/index.js';
import { OnConflictClause } from './clauses/OnConflictClause.js';
import { InsertStatement } from './InsertStatement.js';
import { AbstractSugar } from '../AbstractSugar.js';

export class UpsertStatement extends AbstractSugar(InsertStatement) {
	static get CLAUSE() { return 'UPSERT'; }
	static get DIMENSIONS_TO() { return [UpsertStatement]; }
	static get DESUGARS_TO() { return [InsertStatement]; }

	jsonfy(options = {}, jsonIn = {}) {
		if (!options.deSugar) return super.jsonfy(options, jsonIn);
		const { nodeName: _, flags, ...superJson } = super.jsonfy(options, jsonIn);
		// So let's auto-construct the on-conflict clause for the operation
		if (this.onConflict()) throw new Error(`A redundanct "ON CONFLICT" clause in query.`);
		const columns = (this.set() ? this.set().columns() : this.columns().entries()).map(c => c.name());
		const refFn = this.params.dialect === 'mysql' ? col => q => q.fn('VALUES', col) : col => ['EXCLUDED', col];
		const onConflictClause = OnConflictClause.fromJSON(this, { entries: [] });
		for (const col of columns) onConflictClause.assignment(col, refFn(col));
		// Postgres requires conflict conditions to be specified
		if (this.params.dialect !== 'mysql') {
			const tblSchema = this.into().schema();
			const uniqueKeys = [].concat(tblSchema.primaryKey() || []).concat(tblSchema.uniqueKeys()).map(uk => uk.columns());
			if (!uniqueKeys.length) throw new Error(`Table ${ this.into().clone({ fullyQualified: true }) } has no unique keys defined to process an UPSERT operation. You may want to perform a direct INSERT operation.`);
			const conflictTarget = uniqueKeys.find(keyComp => _intersect(keyComp, columns).length) || uniqueKeys[0];
			onConflictClause.columnsSpec(...conflictTarget);
		}
        return {
            nodeName: InsertStatement.NODE_NAME,
			...superJson,
			onConflictClause: onConflictClause.jsonfy(options),
			...(flags ? { flags } : {})
        };
	}
}