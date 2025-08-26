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

	canReferenceInlineTables() { return true; }

	lookup(deepMatchCallback = null, transformer = null, linkedDb = null) {
		if (!transformer && !linkedDb) return [];

		const name = this._get('value');
		const inGrepMode = (!name || name === '*') && !deepMatchCallback;
		let resultSet = [];

		const resolve = (tableSchema, qualifierJson = undefined) => {
			if (tableSchema instanceof registry.JSONSchema && (!name || name === '*') && deepMatchCallback) {
				// We're trying to resolve a column,
				// and this is an "unaliased" derived query coming from statementContext.artifacts.get('tableSchemas')
				return deepMatchCallback(tableSchema, qualifierJson);
			}
			if (!(tableSchema instanceof registry.TableSchema)) return false;
			if (name && name !== '*' && !tableSchema.identifiesAs(this)) return false;
			
			let result;
			if (deepMatchCallback && !(result = deepMatchCallback(tableSchema, qualifierJson))) return false;
			if (result instanceof AbstractNode || Array.isArray(result)) return result;

			const resolvedTableRef = this.constructor.fromJSON({
				...tableSchema.name().jsonfy({ nodeNames: false }),
				result_schema: tableSchema,
				qualifier: qualifierJson,
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
            return [].concat(resolve(tableSchema) || []);
        }

		// 2. Resolve from InlineTables first?
		if (this.canReferenceInlineTables() && transformer) {
			let statementContext = transformer.statementContext;
			let originalType;
			do {
				for (const { type, resultSchema: tableSchema } of statementContext.artifacts.get('tableSchemas')) {
					if (originalType && originalType !== 'dml' && type === 'dml') {
						// The nested SELECT in an "INSERT ... SELECT" shouldn't see the INSERT
						continue;
					}
					if (!originalType) {
						originalType = type;
					}
					if (type === 'CTEItem' && deepMatchCallback) {
						// columns can't directly reference CTE output columns
						continue;
					}
					resultSet = resultSet.concat(resolve(tableSchema) || []);
					if (!inGrepMode && resultSet.length) break; // Matching current instance only
				}
			} while ((inGrepMode || !resultSet.length) && (statementContext = statementContext.parentTransformer?.statementContext))
		}

		// 3. Resolve normally
		if (!deepMatchCallback/* we're not trying to qualify a column */ && (inGrepMode || !resultSet.length)) {
			resultSet = resultSet.concat((new registry.SchemaRef(this.qualifier()?.jsonfy() || {})).lookup(
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
				linkedDb,
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

	jsonfy(options = {}, transformer = null, linkedDb = null) {
		let resultJson;

		if (options.deSugar
			&& ((!this.qualifier() && Number(options.deSugar) > 1)
				|| !this.resultSchema())
			&& (transformer || linkedDb)) {
			resultJson = this.resolve(transformer, linkedDb).jsonfy(/* IMPORTANT */);
			if (Number(options.deSugar) < 2 && !this.qualifier()) {
				resultJson = { ...resultJson, qualifier: undefined };
			}
		} else {
			resultJson = super.jsonfy(options, transformer, linkedDb);
		}

		if (options.deSugar && resultJson.version_spec) {
			resultJson = { ...resultJson, version_spec: undefined };
		}

		return resultJson;
	}
}