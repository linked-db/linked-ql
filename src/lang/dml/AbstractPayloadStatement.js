import { PathRight } from '../expr/path/PathRight.js';
import { PathJunction } from '../expr/path/PathJunction.js';
import { ColumnsSpec } from './clauses/ColumnsSpec.js';
import { ColumnRef } from '../expr/refs/ColumnRef.js';
import { SetClause } from './clauses/SetClause.js';
import { ValuesSubClause } from './clauses/ValuesSubClause.js';
import { ForeignBinding } from '../expr/ForeignBinding.js';
import { RowSpec } from './clauses/RowSpec.js';
import { Parens } from '../expr/Parens.js';

export const AbstractPayloadStatement = Class => class extends Class {

	#dependencies = [];
	#dependents = [];
	#setClause;

	get dependencies() { return this.#dependencies; }
	get dependents() { return this.#dependents; }
	get localBindings() { return this.queryBindings.filter(b => !b.isForeign); }
	get foreignBindings() { return this.queryBindings.filter(b => b.isForeign); }

	get isPayloadStatement() { return true; }

	set(...args) {
		if (!arguments.length) return this.#setClause;
		this.#setClause = this.$castInputs(args, SetClause, this.#setClause, 'set', 'assignment');
		return this;
	}

	renderForeignBindings(sourceQuery, resultData) {
		const foreignBindings = this.foreignBindings;
		return foreignBindings.filter(binding => binding.resolve(sourceQuery, resultData));
	}

	createExecutionPlan(recursionCallback) {
		const preHook = async () => {
			if (!this.#dependencies.length) return;
			for (const dependencyQuery of this.#dependencies) {
				const dependencyData = await recursionCallback(dependencyQuery);
				this.renderForeignBindings(dependencyQuery, dependencyData);
			}
		};
		const postHook = async resultData => {
			if (!this.#dependents.length) return resultData;
			for (const dependentQuery of this.#dependents) {
				const tt = dependentQuery.renderForeignBindings(this, resultData);
				const dependentData = await recursionCallback(dependentQuery);
			}
			return resultData;
		};
		return [preHook, postHook];
	}

	filterPayload(columnsSpec, rowSetEntries, options = {}) {
		const dimensions = new Map;
		const reducedColumsSpec = columnsSpec.jsonfy(options, {}, /*reducer*/(columnNode, columnOffset) => {
			if (columnNode instanceof PathRight) {
				const [dimension, resolvedFk] = this.createDimension(columnNode, options);
				dimensions.set(columnOffset, dimension);
				if (resolvedFk) return resolvedFk;
			} else return columnNode.jsonfy(options);
		});
		const reducedRowSpecs = rowSetEntries.map((valuesSpec, rowOffset) => valuesSpec.jsonfy(options, {}, /*reducer*/(valueNode, columnOffset) => {
			if (dimensions.has(columnOffset)) {
				return dimensions.get(columnOffset).offload(options.explicitRowOffset ?? rowOffset, valueNode);
			}
			return valueNode.jsonfy(options);
		}));
		dimensions.clear();
		return [reducedColumsSpec, reducedRowSpecs];
	}

	#generatedDependencies = new Set;
	#generatedDependents = new Set;
	#generatedReturning = new Set;
	createDimension(dimensionSpec, options = {}) {
		if (![ColumnsSpec, ColumnRef, PathRight].some(c => dimensionSpec.rhs() instanceof c)) {
			throw new Error(`Invalid columns spec: ${dimensionSpec}`);
		}
		const $options = { ...options, deSugar: false };
		const [keyLhs_bareIdent, targetTableIdent, keyRhs_bareIdent] = dimensionSpec.plot();
		// Do either an INSERT OR AN UPSERT
		const query = new ([].concat(this.constructor.DIMENSIONS_TO)[0])(this.baseClient);
		query.into(targetTableIdent.jsonfy());
		// Figure the expected payload structure
		let columnsSpec = dimensionSpec.rhs();
		query.columns(columnsSpec.jsonfy($options));
		// Payload structure must match column spec
		const resolvePayload = (payload, inMultiRowStructure = false) => {
			if (payload instanceof Parens) payload = payload.exprUnwrapped();
			if (!inMultiRowStructure && (payload instanceof ValuesSubClause)) throw new Error(`Single-row payload structure expected for column structure: ${dimensionSpec.rhs()}. Recieved ${payload.constructor.NODE_NAME}.`);
			if (inMultiRowStructure && !(payload instanceof ValuesSubClause)) {
				payload = [payload];
			}
			return payload;
		};
		const validateRowLength = (row, adjustmentForAddedKeyColumn = 0) => {
			const rowLength = (row instanceof RowSpec ? row.length : 1) + adjustmentForAddedKeyColumn;
			if (rowLength > query.columns().length) throw new Error(`INSERT has more expressions than target columns`);
			if (rowLength < query.columns().length) throw new Error(`INSERT has more target columns than expressions`);
			return row;
		};
		// Here, we do total offload, returning nothing
		if (dimensionSpec.lhs() instanceof PathJunction) {
			query.columns().add(keyRhs_bareIdent.name());
			const queryPK = keyLhs_bareIdent.name();
			if (!this.returning()?.has(queryPK)) {
				this.#generatedReturning.add(queryPK);
			}
			const offload = (rowOffset, payload) => {
				payload = resolvePayload(payload, true);
				const fKBinding = ForeignBinding.fromJSON(query, {
					resolutionPath: [this.uuid, rowOffset, queryPK]
				});
				for (const row of payload) {
					const $row = validateRowLength(row, 1).jsonfy(options);
					$row.entries.push(fKBinding.jsonfy());
					query.values($row);
				}
			};
			const dimension = { query, offload, };
			this.#generatedDependents.add(dimension);
			return [dimension];
		}
		query.returning('*');
		// Here, we do normal offload, returning real column name
		const offload = (rowOffset, payload) => {
			const $row = resolvePayload(payload, false);
			query.values(validateRowLength($row).jsonfy(options));
			return ForeignBinding.fromJSON(this, {
				resolutionPath: [query.uuid, rowOffset, /*PK of dimension*/keyRhs_bareIdent.name()] 
			}).jsonfy();
		};
		const dimension = { query, offload };
		this.#generatedDependencies.add(dimension);
		return [dimension, keyLhs_bareIdent.jsonfy()/*FK of base*/];
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.table) return;
		return super.fromJSON(context, json, (instance) => {
			if (json.setClause) instance.set(json.setClause);
			if (json.dependencies?.length) {
				instance.#dependencies = instance.$castInputs(json.dependencies, this.DIMENSIONS_TO, [], );
			}
			if (json.dependents?.length) {
				instance.#dependents = instance.$castInputs(json.dependents, this.DIMENSIONS_TO, [], );
			}
			callback?.(instance);
		});
	}

	jsonfy(options, jsonInCallback) {
		const jsonOut = super.jsonfy(options, () => ({
			...(this.#setClause ? { setClause: this.#setClause?.jsonfy(options) } : {}),
			...jsonInCallback(),
		}));
		return jsonOut;
	}

	finalizeJSON(json, options) {
		if (this.#generatedDependencies.size || this.#generatedDependents.size) {
			json.dependencies = [...this.#generatedDependencies].map(d => d.query.jsonfy(options));
			json.dependents = [...this.#generatedDependents].map(d => d.query.jsonfy(options));
			this.#generatedDependencies.clear();
			this.#generatedDependents.clear();
		}
		return super.finalizeJSON(json, options);
	}
}