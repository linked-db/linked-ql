import { AbstractOperator2Expr } from '../abstracts/AbstractOperator2Expr.js';
import { AbstractSugar } from '../../AbstractSugar.js';
import { GlobalTableRef } from '../refs/GlobalTableRef.js';
import { ColumnRef } from '../refs/ColumnRef.js';
import { PathJunction } from './PathJunction.js';
import { PathLeft } from './PathLeft.js';

export class AbstractPath extends AbstractSugar(AbstractOperator2Expr) {

	get isPath() { return true; }
	
	static get expose() {
		return { path: (context, lhs, operator, rhs) => this.fromJSON(context, { lhs, operator, rhs }), };
	}

	plot(fullyQualified = false) {
		const targetSchema = this.schema();
		let keyLhs_ident, keyRhs_ident;
		if (this.lhs() instanceof PathJunction) {
			const lhsEndpoint = this.lhs().endpoint();
			const lhsFk = lhsEndpoint.schema().foreignKey();
			if (!lhsFk) throw new Error(`[${this}]: Column ${lhsEndpoint.clone({ fullyQualified: true })} is not a foreign key.`);
			const lhsEndpointTable = lhsFk.targetTable();
			const querySchema = this.capture('DATABASE_SCHEMA'); // Intentially using capture here to use cached version and which excludes schemas for newerly path-generated joins
			for (const $col of querySchema/*query*/.columns()) {
				if (!$col.primaryKey()) continue;
				if ($col.prefix(true).identifiesAs(lhsEndpointTable)) {
					const $keyLhs_ident = ColumnRef.fromJSON(this, [$col.contextNode.name(), $col.name()]);
					if (keyLhs_ident) throw new Error(`[${this}]: Target primary key for foreign key ${lhsEndpoint.clone({ fullyQualified: true })} is ambiguous. (Is it ${keyLhs_ident} or ${$keyLhs_ident}?)`);
					keyLhs_ident = $keyLhs_ident;
				}
			}
			if (!keyLhs_ident) throw new Error(`Path ${this} could not be resolved against base query.`);
			const keyRhs = this.lhs().lhs();
			keyRhs_ident = keyRhs instanceof PathLeft
				? keyRhs.clone({ reverse: true })
				: keyRhs.clone({ fullyQualified });
		} else {
			keyLhs_ident = this.lhs().clone({ fullyQualified });
			keyRhs_ident = ColumnRef.fromJSON(this, [targetSchema.name(), targetSchema.primaryKey().columns()[0]]);
		}
		const targetTableIdent = GlobalTableRef.fromJSON(this, [targetSchema.prefix(true).name(), targetSchema.name()]);
		return [ keyLhs_ident, targetTableIdent, keyRhs_ident ];
	}

    jsonfy(options = {}, jsonIn = {}) {
        if (!options.deSugar || !this.statementNode) return super.jsonfy(options, jsonIn);
		return this.statementNode.resolvePath(this, options);
    }
}