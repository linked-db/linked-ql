import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { PathMixin } from '../../abstracts/PathMixin.js';
import { registry } from '../../registry.js';

export class TableRef1 extends PathMixin(AbstractClassicRef) {

	/* SYNTAX RULES */

	static get _qualifierType() { return 'SchemaRef'; }

	static get syntaxRules() {
		return this.buildSyntaxRules({
			syntax: [
				{ type: 'identifier', as: '.' },
				{ type: 'LQVersionSpec', as: 'version_spec', optional: true, autoSpacing: false }
			],
			autoSpacing: false,
		});
	}

	/* AST API */

	versionSpec() { return this._get('version_spec'); }

	/* API */

	dataType() { return registry.DataType.fromJSON({ value: 'SET' }); }

	// ----------------

	canReferenceInlineTables() { return true; }

	lookup(deepMatchCallback = null, transformer = null, schemaInference = null) {
		if (!transformer && !schemaInference) return [];

		const name = this._get('value');
		const inGrepMode = (!name || name === '*') && (!deepMatchCallback || this.parentNode?.value?.() === '*');

		const isFromItemRef = this.parentNode instanceof registry.FromItem;
		const enclosingDerivedQuery = this.statementNode?.parentNode instanceof registry.DerivedQuery
			? this.statementNode?.parentNode
			: null;
		const canTraverseUp = isFromItemRef // Can reference CTE
			|| !enclosingDerivedQuery 
			|| !(enclosingDerivedQuery.parentNode instanceof registry.FromItem)
			|| !(enclosingDerivedQuery.parentNode/* FromItem */.parentNode/* FromClause */?.parentNode/* SelectStmt */ instanceof registry.SelectStmt)
			|| enclosingDerivedQuery.parentNode.lateralKW();

		let resultSet = [];

		const resolve = (tableSchema, qualifierJson = undefined, resolution = 'default') => {
			if (tableSchema instanceof registry.JSONSchema && (!name || name === '*') && deepMatchCallback) {
				// We're trying to resolve a column,
				// and this is an "unaliased" derived query coming from statementContext.artifacts.get('tableSchemas')
				return deepMatchCallback(tableSchema, qualifierJson, resolution);
			}
			if (!(tableSchema instanceof registry.TableSchema)) return false;
			if (name && name !== '*' && !tableSchema.identifiesAs(this)) return false;

			let result;
			if (deepMatchCallback && !(result = deepMatchCallback(tableSchema, qualifierJson, resolution))) return false;
			if (result instanceof AbstractNode || Array.isArray(result)) return result;

			const resolvedTableRef = this.constructor.fromJSON({
				...tableSchema.name().jsonfy({ nodeNames: false }),
				resolution,
				qualifier: qualifierJson,
				result_schema: tableSchema,
			});
			this.parentNode?._adoptNodes(resolvedTableRef);

			return resolvedTableRef;
		};

		// 1. Resolve system refs statically
		const systemTableRefs = (this.options.dialect || 'postgres') === 'postgres'
			? ['EXCLUDED']
			: [];
		if (systemTableRefs.includes(name?.toUpperCase()) && transformer) {
			const tableSchema = [...transformer.statementContext.artifacts.get('tableSchemas')][0].resultSchema.clone({
				renameTo: { nodeName: registry.Identifier.NODE_NAME, value: name },
			});
			return [].concat(resolve(tableSchema, undefined, 'system') || []);
		}

		// 2. Resolve from InlineTables first?
		if (this.canReferenceInlineTables() && transformer) {
			let statementContext = transformer.statementContext;
			let originalType, inSuperScopeNow, queryScopes = new Set;
			do {
				inSuperScopeNow = statementContext !== transformer.statementContext;
				if (!isFromItemRef) {
					queryScopes.add(statementContext);
				}
				for (const { type, resultSchema: tableSchema } of statementContext.artifacts.get('tableSchemas')) {
					if (isFromItemRef) {
						if (type !== 'CTEItem') continue;
					} else {
						if (type === 'CTEItem') continue;
						if (originalType && originalType !== 'dml' && type === 'dml') {
							// The nested SELECT in an "INSERT ... SELECT" shouldn't see the INSERT
							continue;
						}
						if (!originalType) {
							originalType = type;
						}
					}
					resultSet = resultSet.concat(resolve(
						tableSchema,
						undefined,
						type === 'CTEItem'
							? 'cte'
							: (inSuperScopeNow ? 'scope' : 'default')
					) || []);
					if (resultSet.length && !inGrepMode) {
						for (const queryScope of queryScopes) {
							if (!queryScope.artifacts.has('derivedQueryCorrelationFlag')) continue;
							queryScope.artifacts.set('derivedQueryCorrelationFlag', true);
						}
						break;
					}
				}
			} while (canTraverseUp && (inGrepMode || !resultSet.length) && (statementContext = statementContext.parentTransformer?.statementContext))
		}

		// 3. Resolve normally
		if (!deepMatchCallback/* we're not trying to qualify a column */ && (inGrepMode || !resultSet.length)) {
			const tempSchemaRef = new registry.SchemaRef(this.qualifier()?.jsonfy() || {});
            this._adoptNodes(tempSchemaRef);
			resultSet = resultSet.concat(tempSchemaRef.lookup(
				(schemaSchema) => {

					return schemaSchema._get('entries').reduce((prev, tableSchema) => {
						//if (prev.length && !inGrepMode) return prev;
						const newQualifierJson = {
							...schemaSchema.name().jsonfy({ nodeNames: false }),
							result_schema: schemaSchema
						};
						return prev.concat(resolve(tableSchema, newQualifierJson) || []);
					}, []);

				},
				transformer,
				schemaInference,
			));
		}

		if (name === '*') {
			const compositeResult = registry.TableRef0.fromJSON({
				value: this.value(),
				result_schema: registry.JSONSchema.fromJSON({ entries: resultSet.map((s) => s.clone()) }, { assert: true }),
			});
			this.parentNode._adoptNodes(compositeResult);
			resultSet = [compositeResult];
		}

		return resultSet;
	}

	jsonfy(options = {}, transformer = null, schemaInference = null) {
		let resultJson;
		if (options.deSugar && (
			((options.deSugar === true || options.deSugar.tableQualifiers) && !this.qualifier())
			|| !this.resultSchema()
		) && (transformer || schemaInference)) {
			// Table qualification or schema resolution...
			resultJson = this.resolve(transformer, schemaInference).jsonfy(/* IMPORTANT */);
			// Case normalization...
			if ((options.deSugar === true || options.deSugar.normalizeCasing) && !resultJson.delim) {
				resultJson = { ...resultJson, value: resultJson.resolution === 'system' ? resultJson.value.toUpperCase() : resultJson.value.toLowerCase() };
			}
			// Drop qualifier...
			if (!(options.deSugar === true || options.deSugar.tableQualifiers) && !this.qualifier()) {
				resultJson = { ...resultJson, qualifier: undefined };
			}
		} else {
			resultJson = super.jsonfy(options, transformer, schemaInference);
		}
		// Drop version specs...
		if ((options.deSugar === true || options.deSugar?.dropVersionSpecs) && resultJson.version_spec) {
			resultJson = { ...resultJson, version_spec: undefined };
		}
		return resultJson;
	}
}