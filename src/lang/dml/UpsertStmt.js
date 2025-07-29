import { SugarMixin } from '../abstracts/SugarMixin.js';
import { InsertStmt } from './InsertStmt.js';

export class UpsertStmt extends SugarMixin(InsertStmt) {

	/* SYNTAX RULES */

	static get _clause() { return 'UPSERT'; }

	/* DESUGARING API */
	
    jsonfy(options = {}, superTransformCallback = null, linkedDb = null) {
		if (!options.deSugar) return super.jsonfy(options, superTransformCallback, linkedDb);

		if (this.conflictHandlingClause()) {
			throw new Error(`A redundanct "ON CONFLICT" clause in query.`);
		}
		const resultJson = super.jsonfy(options, superTransformCallback, linkedDb);

		// So let's auto-construct the on-conflict clause for the operation
		const columns = (this.set() ? this.set().columns() : this.columns().entries()).map(c => c.name());
		const refFn = this.params.dialect === 'mysql' ? col => q => q.fn('VALUES', col) : col => ['EXCLUDED', col];
		const onConflictClause = OnConflictClause.fromJSON(this, { entries: [] });
		for (const col of columns) onConflictClause.add([col, refFn(col)]);
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
			onConflictClause: onConflictClause.jsonfy(options, superTransformCallback, linkedDb),
			...(flags ? { flags } : {})
        };
	}
}