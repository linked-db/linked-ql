import { DatabaseSchema } from '../ddl/database/DatabaseSchema.js';
import { OrderByClause } from './clauses/OrderByClause.js';
import { LimitClause } from './clauses/LimitClause.js';
import { WhereClause } from './clauses/WhereClause.js';
import { JoinClause } from './clauses/JoinClause.js';
import { PathRight } from '../expr/path/PathRight.js';
import { ColumnRef } from '../expr/refs/ColumnRef.js';
import { JsonAgg } from '../expr/json/JsonAgg.js';

export const AbstractQueryStatement = Class => class extends Class {

	#joinClauses = [];
	#whereClause;
	#orderByClause;
	#limitClause;

	joins() { return this.#joinClauses; }

	join(table) {
		this.#joinClauses = this.$castInputs([table], JoinClause, this.#joinClauses, 'join_clause', 'full');
		return this.#joinClauses[this.#joinClauses.length - 1];
	}

	leftJoin(table) {
		this.#joinClauses = this.$castInputs([table], JoinClause, this.#joinClauses, 'join_clause', 'left');
		return this.#joinClauses[this.#joinClauses.length - 1];
	}

	rightJoin(table) {
		this.#joinClauses = this.$castInputs([table], JoinClause, this.#joinClauses, 'join_clause', 'right');
		return this.#joinClauses[this.#joinClauses.length - 1];
	}

	innerJoin(table) {
		this.#joinClauses = this.$castInputs([table], JoinClause, this.#joinClauses, 'join_clause', 'inner');
		return this.#joinClauses[this.#joinClauses.length - 1];
	}

	crossJoin(table) {
		this.#joinClauses = this.$castInputs([table], JoinClause, this.#joinClauses, 'join_clause', 'cross');
		return this.#joinClauses[this.#joinClauses.length - 1];
	}

	where(...args) {
		if (!arguments.length) return this.#whereClause;
		this.#whereClause = this.$castInputs(args, WhereClause, this.#whereClause, 'where_clause', 'every');
		return this;
	}

	orderBy(...args) {
		if (!arguments.length) return this.#orderByClause;
		this.#orderByClause = this.$castInputs(args, OrderByClause, this.#orderByClause, 'order_by_clause', 'add');
		return this.#orderByClause;
	}

	limit(value) {
		if (!arguments.length) return this.#limitClause;
		this.#limitClause = this.$castInputs([value], LimitClause, this.#limitClause, 'limit_clause', 'value');
		return this;
	}

	schema({ derivationLevel = false } = {}) {
		const dbSchema = DatabaseSchema.fromJSON(this, { name: '', tables: [] });
		const selectAll_list = [];
		if (derivationLevel) {
			const selectListOnly_directive = derivationLevel === 'SELECT_LIST_ONLY';
			for (const field of this.fields?.() || []) {
				if (field.expr().name?.() === '*') {
					if (selectListOnly_directive) selectAll_list.push(field.expr().prefix()?.name());
					continue;
				}
				const fieldSchema = field.schema();
				if (!fieldSchema) continue;
				const $tblName = fieldSchema.contextNode.name();
				if (!dbSchema.table($tblName)) {
					const tblSchema_json = fieldSchema.contextNode.jsonfy(); // Use jsonfy() to retain prefix and name diffs
					dbSchema.table({ ...tblSchema_json, columns: [] });
				}
				dbSchema.table($tblName).column(fieldSchema.jsonfy());
			}
			if (selectListOnly_directive && !selectAll_list.length) return dbSchema;
		}
		for (const tblSchema of [...this.tables(), ...this.joins()].map(tbl => tbl.schema())) {
			const $tblName = tblSchema.name();
			if (selectAll_list.length && !selectAll_list.includes($tblName) && !selectAll_list.includes(undefined)) continue;
			const tblSchema_json = tblSchema.jsonfy(); // Use jsonfy() to retain prefix and name diffs
			if (dbSchema.table($tblName)/*from fields derivation step above*/) {
				for (const colSchema_json of tblSchema_json.columns) {
					dbSchema.table($tblName).column(colSchema_json);
				}
			} else dbSchema.table(tblSchema_json);
		}
		return dbSchema;
	}

	#schemaCaptureCache = new Map;
	$capture(requestName, requestSource) {
		if (requestName === 'TABLE_SCHEMA') return;
		if (requestName === 'DATABASE_SCHEMA') {
			const derivationLevel = this.orderBy()?.contains(requestSource) ? 1 : 0;
			if (!this.#schemaCaptureCache.has(derivationLevel)) {
				this.#schemaCaptureCache.set(derivationLevel, this.schema({ derivationLevel }));
			}
			return this.#schemaCaptureCache.get(derivationLevel);
		}
		return super.$capture(requestName, requestSource);
	}

	#generatedJoins = new Map;
	resolvePath(path, options) {
		if (!(path instanceof PathRight)) throw new Error(`Can't desugar path: ${path}. Must be instance of PathRight.`);
		const [ keyLhs_ident, targetTableIdent, keyRhs_ident ] = path.plot(true/*fullyQualified*/);
		// Relationship details, to begin
		const relationID = `$relation::${[keyLhs_ident, targetTableIdent, keyRhs_ident].join(':')}${path.rhs() instanceof JsonAgg ? '/g' : ''}`;
		// The JOIN, next
		if (!this.#generatedJoins.has(relationID)) {
			const keyRhsMask = `$key::${(0 | Math.random() * 9e6).toString(36)}`;
			const join = new JoinClause(this);
			join.left(
				q => q.select(q => q.expr(keyRhs_ident.jsonfy()).as(keyRhsMask)).from([targetTableIdent.prefix(), targetTableIdent.name()])
			).as(relationID).on(on => on.equals([relationID, keyRhsMask], keyLhs_ident.jsonfy()));
			if (path.rhs() instanceof JsonAgg) { join.expr().expr().groupBy(keyRhsMask); }
			this.#generatedJoins.set(relationID, join);
		}
		const pathID = `$path::${(0 | Math.random() * 9e6).toString(36)}`;
		const detailQ = q => q.expr(path.rhs().jsonfy()).as(pathID);
		this.#generatedJoins.get(relationID).expr()/*SubQuery*/.expr()/*Select*/.fields().add(detailQ);
		return {
			nodeName: ColumnRef.NODE_NAME,
			name: pathID,
			prefix: relationID,
			prettyName: path.prettyName(),
		};
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json.joinClauses?.length) for (const tbl of json.joinClauses) instance.join(tbl);
			if (json.whereClause) instance.where(json.whereClause);
			if (json.orderByClause) instance.orderBy(json.orderByClause);
			if (json.limitClause) instance.limit(json.limitClause);
			callback?.(instance);
		});
	}

	jsonfy(options, jsonInCallback) {
		return super.jsonfy(options, () => ({
			...(this.#joinClauses.length ? { joinClauses: this.#joinClauses.map(j => j.jsonfy(options)) } : {}),
			...(this.#whereClause ? { whereClause: this.#whereClause.jsonfy(options) } : {}),
			...(this.#orderByClause ? { orderByClause: this.#orderByClause.jsonfy(options) } : {}),
			...(this.#limitClause ? { limitClause: this.#limitClause.jsonfy(options) } : {}),
			...jsonInCallback(),
		}));
	}

	finalizeJSON(json, options) {
		if (!json.joinClauses) json.joinClauses = [];
		for (const [, join] of this.#generatedJoins) {
			json.joinClauses.push(join.jsonfy(options));
		}
		this.#generatedJoins.clear();
		return super.finalizeJSON(json, options);
	}
}