import { Lexer } from '../Lexer.js';
import { AbstractPayloadStatement } from './AbstractPayloadStatement.js';
import { AbstractDMLStatement } from './AbstractDMLStatement.js';
import { ValuesClause } from './clauses/ValuesClause.js';
import { ColumnsSpec } from './clauses/ColumnsSpec.js';
import { SetClause } from './clauses/SetClause.js';
import { SelectStatement } from '../dql/SelectStatement.js';
import { OnConflictClause } from './clauses/OnConflictClause.js';
import { ReturningClause } from './clauses/ReturningClause.js';
import { DatabaseSchema } from '../ddl/database/DatabaseSchema.js';
import { GlobalTableRef } from '../expr/refs/GlobalTableRef.js';

export class InsertStatement extends AbstractPayloadStatement(AbstractDMLStatement) {
	static get CLAUSE() { return 'INSERT'; }
	static get DIMENSIONS_TO() { return [InsertStatement]; }

	#table;
	#columnsSpec;
	#valuesClause;
	#selectClause;
	#onConflictClause;

	into(table) {
		if (!arguments.length) return this.#table;
		this.#table = this.$castInputs([table], GlobalTableRef, this.#table, 'table_spec', 'expr');
		return this;
	}

	columns(...args) {
		if (!arguments.length) return this.#columnsSpec;
		this.#columnsSpec = this.$castInputs(args, ColumnsSpec, this.#columnsSpec, 'columns_spec', 'add');
		return this;
	}

	values(...args) {
		if (!arguments.length) return this.#valuesClause;
		this.#valuesClause = this.$castInputs(args, ValuesClause, this.#valuesClause, 'values_clause', 'add');
		return this;
	}

	select(...query) {
		if (!arguments.length) return this.#selectClause;
		this.#selectClause = this.$castInputs(query, SelectStatement, this.#selectClause, 'select_clause', 'fields');
		return this;
	}

	onConflict(...args) {
		if (!arguments.length) return this.#onConflictClause;
		this.#onConflictClause = this.$castInputs(args, OnConflictClause, this.#onConflictClause, 'on_conflict_clause', 'assignment');
		return this;
	}

	schema() {
		const dbSchema = DatabaseSchema.fromJSON(this, { name: '', tables: [] });
		dbSchema.table(this.#table.schema().jsonfy());
		return dbSchema;
	}

	#schemaCaptureCache;
	$capture(requestName, requestSource) {
		if (requestName === 'TABLE_SCHEMA') return;
		if (requestName === 'DATABASE_SCHEMA') {
			if (!this.#schemaCaptureCache) this.#schemaCaptureCache = this.schema();
			return this.#schemaCaptureCache;
		}
		return super.$capture(requestName, requestSource);
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.table) return;
		return super.fromJSON(context, json, (instance) => {
			instance.into(json.table);
			if (json.columnsSpec) instance.columns(json.columnsSpec);
			if (json.valuesClause) instance.values(json.valuesClause);
			if (json.selectClause) instance.select(json.selectClause);
			if (json.onConflictClause) instance.onConflict(json.onConflictClause);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, () => {
			let columnsSpec, valuesClause, selectClause;
			// Handle desugaring of columns and values
			if (options.deSugar && this.#columnsSpec && this.#valuesClause) {
				const [ reducedColumsSpec, reducedRowSpecs ] = this.filterPayload(this.#columnsSpec, this.#valuesClause.entries(), options);
				columnsSpec = reducedColumsSpec;
				valuesClause = {
					nodeName: ValuesClause.NODE_NAME,
					entries: reducedRowSpecs,
				};
			} else {
				columnsSpec = this.#columnsSpec?.jsonfy(options);
				valuesClause = this.#valuesClause?.jsonfy(options);
				selectClause = this.#selectClause?.jsonfy(options);
			}
			// This self-desugars, being an instance of SetClause
			const onConflictClause = this.#onConflictClause?.jsonfy(options);
			return {
				table: this.#table?.jsonfy(options),
				...(columnsSpec ? { columnsSpec } : {}),
				...(valuesClause ? { valuesClause } : {}),
				...(selectClause ? { selectClause } : {}),
				...(onConflictClause ? { onConflictClause } : {}),
				...jsonIn,
			};
		});
	}

	static parse(context, expr, parseCallback) {
		const [match, mysqlIgnore, body] = (new RegExp(`^${this.CLAUSE}(?:\\s+(IGNORE))?(?:\\s+INTO)?([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context);
		const $body = this.mySubstitutePlaceholders(instance, body.trim());
		// Tokenize
		const dialect = context?.params?.dialect || 'postgres';
		const clauses = { values: ValuesClause, ...(dialect === 'mysql' ? { set: SetClause } : {}), select: SelectStatement, onConflict: OnConflictClause, returning: ReturningClause };
		const [tableAndColumnsSpec, ...tokens] = Lexer.split($body, Object.values(clauses).map(x => x.REGEX || x.CLAUSE || x), { useRegex: 'i', preserveDelims: true });
		const [tableSpec, columnsSpec = ''] = Lexer.split(tableAndColumnsSpec, []);
		// Parse
		instance.into(parseCallback(instance, tableSpec.trim(), [GlobalTableRef]));
		if (columnsSpec.trim()) instance.columns(parseCallback(instance, columnsSpec.trim(), [ColumnsSpec]));
		main: for (const token of tokens) {
			for (const verb in clauses) {
				const node = clauses[verb].parse?.(instance, token.trim(), parseCallback);
				if (node) { instance[verb](node); continue main; }
			}
		}
		if (mysqlIgnore) instance.withFlag(mysqlIgnore);
		return instance;
	}

	stringify() {
		const sql = [this.constructor.CLAUSE];
		sql.push(...this.getFlag().map(s => s.replace(/_/g, ' ')));
		sql.push('INTO', this.#table);
		if (this.params.dialect === 'mysql' && this.set()) {
			sql.push(this.set());
		} else {
			sql.push(this.#columnsSpec);
			if (this.#valuesClause) sql.push(this.#valuesClause);
			else sql.push(this.#selectClause);
		}
		sql.push(this.#onConflictClause);
		sql.push(this.returning());
		return sql.filter(s => s).join(' ');
	}
}