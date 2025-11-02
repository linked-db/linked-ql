import { DatabaseSchema } from '../ddl/database/DatabaseSchema.js';
import { Assertion } from '../expr/logic/Assertion.js';
import { OrderByClause } from './clauses/OrderByClause.js';
import { LimitClause } from './clauses/LimitClause.js';
import { WhereClause } from './clauses/WhereClause.js';
import { JoinClause } from './clauses/JoinClause.js';
import { PathRight } from '../expr/path/PathRight.js';
import { ColumnRef } from '../expr/refs/ColumnRef.js';
import { JsonAgg } from '../expr/json/JsonAgg.js';
import { Table } from './clauses/Table.js';

export const AbstractQueryStatement = Class => class extends Class {

	#joinClauses = [];
	#whereClause;
	#orderByClause;
	#limitClause;

	joins(...args) {
		if (!arguments.length) return this.#joinClauses;
		this.#joinClauses = this.$castInputs(args, JoinClause, this.#joinClauses, 'join_clause');
		return this;
	}

	join(table) { return this.joins(table); }

	innerJoin(table) {
		this.join(table);
		return (this.#joinClauses[this.#joinClauses.length - 1].type('INNER_JOIN'), this);
	}

	crossJoin(table) {
		this.join(table);
		return (this.#joinClauses[this.#joinClauses.length - 1].type('CROSS_JOIN'), this);
	}

	leftJoin(table) {
		this.join(table);
		return (this.#joinClauses[this.#joinClauses.length - 1].type('LEFT_JOIN'), this);
	}

	rightJoin(table) {
		this.join(table);
		return (this.#joinClauses[this.#joinClauses.length - 1].type('RIGHT_JOIN'), this);
	}

	fullJoin(table) {
		this.join(table);
		return (this.#joinClauses[this.#joinClauses.length - 1].type('FULL_JOIN'), this);
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
		const [keyLhs_ident, targetTableIdent, keyRhs_ident] = path.plot(true/*fullyQualified*/);
		// Relationship details, to begin
		const relationID = `$relation::${[keyLhs_ident, targetTableIdent, keyRhs_ident].join(':')}${path.rhs() instanceof JsonAgg ? '/g' : ''}`;
		// The JOIN, next
		if (!this.#generatedJoins.has(relationID)) {
			const keyRhsMask = `$key::${(0 | Math.random() * 9e6).toString(36)}`;
			const clause = new JoinClause(this);
			clause.type('LEFT_JOIN').expr(
				q => q.select(q => q.expr(keyRhs_ident.jsonfy()).as(keyRhsMask)).from([targetTableIdent.prefix(), targetTableIdent.name()])
			).as(relationID).on(on => on.equals([relationID, keyRhsMask], keyLhs_ident.jsonfy()));
			if (path.rhs() instanceof JsonAgg) { clause.expr().expr().groupBy(keyRhsMask); }
			this.#generatedJoins.set(relationID, clause);
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
			if (json.joinClauses?.length) instance.joins(...json.joinClauses);
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
		if (!this.#generatedJoins.size) {
			return super.finalizeJSON(json, options);
		}
		// Derived joins need special rewrite on postgre updates and deletes
		const rand = (0 | Math.random() * 9e6).toString(36);
		if (this.params.dialect === 'postgres' && this.NODE_NAME === 'UPDATE_STATEMENT') {
			const pgGeneratedFromEntries = new Map;
			const rederiveGeneratedJoinRefForPgUpdate = (columnRef) => {
				return json.tables.reduce((prev, tbl) => {
					if (prev) return prev;
					const tblRefOriginal = tbl.expr;
					const tblAliasOriginal = tbl.alias || tbl.expr.name;
					const colRefOriginal = columnRef.name;
					if (columnRef.prefix.name !== tblAliasOriginal) return;
					const tblAliasRewrite = `${tblAliasOriginal}:${rand}`;
					const colRefRewrite = `${colRefOriginal}:${rand}`;
					if (!pgGeneratedFromEntries.has(tblAliasOriginal)) {
						pgGeneratedFromEntries.set(tblAliasOriginal, {
							tblAliasOriginal,
							tblAliasRewrite,
							colRefOriginal,
							colRefRewrite,
							table: { expr: tblRefOriginal },
							alias: tblAliasRewrite,
							fields: []
						});
					}
					pgGeneratedFromEntries.get(tblAliasOriginal).fields.push({
						expr: { name: colRefOriginal }, alias: colRefRewrite
					});
					return {
						name: colRefRewrite,
						prefix: { name: tblAliasRewrite }
					};
				}, null) || columnRef;
			};
			if (!json.joinClauses) json.joinClauses = [];
			for (const [, join] of this.#generatedJoins) {
				const joinJson = join.jsonfy(options);
				joinJson.onClause.entries = joinJson.onClause.entries.map((c) => ({
					...c, rhs: rederiveGeneratedJoinRefForPgUpdate(c.rhs)
				}));
				json.joinClauses.push(joinJson);
			}
			if (pgGeneratedFromEntries.size) {
				if (!json.postgresFromList) json.postgresFromList = [];
				if (!json.whereClause) json.whereClause = { nodeName: 'WHERE_CLAUSE', entries: [] };
				for (const [, derivation] of pgGeneratedFromEntries) {
					json.postgresFromList.push(
						Table.fromJSON(this, {
							expr: (q) => q.select(...derivation.fields).from(derivation.table),
							alias: derivation.alias
						}).jsonfy(options),
					);
					json.whereClause.entries.unshift(
						Assertion.fromJSON(this, {
							operator: '=',
							lhs: [derivation.tblAliasOriginal, derivation.colRefOriginal],
							rhs: [derivation.tblAliasRewrite, derivation.colRefRewrite]
						})
					);
				}
			}
		} else if (this.params.dialect === 'postgres' && this.NODE_NAME === 'DELETE_STATEMENT') {
			const tblRefOriginal = json.table.expr;
			const tblAliasOriginal = json.table.alias || json.table.expr.name;
			const tblAliasRewrite = `${tblAliasOriginal}:${rand}`;
			const whereClauseOriginal = json.whereClause;
			const pk = this.from().schema().primaryKey().columns()[0];
			json.table = {
				expr: tblRefOriginal,
				alias: tblAliasRewrite
			};
			json.whereClause = Assertion.fromJSON(this, {
				operator: 'IN',
				lhs: {
					name: pk,
					prefix: { name: tblAliasRewrite }
				},
				rhs: (q) => {
					q.select({ name: pk, })
					.from({ expr: tblRefOriginal, alias: tblAliasOriginal })
					.where(whereClauseOriginal)
					.joins(...[...this.#generatedJoins].map(([, j]) => j.jsonfy(options)));
				}
			}).jsonfy(options);
		} else {
			if (!json.joinClauses) json.joinClauses = [];
			for (const [, join] of this.#generatedJoins) {
				json.joinClauses.push(join.jsonfy(options));
			}
		}
		this.#generatedJoins.clear();
		return super.finalizeJSON(json, options);
	}
}