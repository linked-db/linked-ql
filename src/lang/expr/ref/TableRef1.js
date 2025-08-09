import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { PathMixin } from '../../abstracts/PathMixin.js';
import { JSONSchema } from '../../abstracts/JSONSchema.js';
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
		const inGrepMode = !name && !deepMatchCallback;
		let resultSet = [];

		const resolve = (tableSchema, qualifierJson = undefined) => {
			if (tableSchema instanceof JSONSchema && !name && deepMatchCallback) {
				// We're trying to resolve a column,
				// and this is an "unaliased" derived query coming from statementContext.artifacts.get('tableSchemas')
				return deepMatchCallback(tableSchema, qualifierJson);
			}
			if (!(tableSchema instanceof registry.TableSchema)) return false;
			if (name && !tableSchema.identifiesAs(this)) return false;
			let result;
			if (deepMatchCallback && !(result = deepMatchCallback(tableSchema, qualifierJson))) return false;
			if (result instanceof AbstractNode || Array.isArray(result)) return result;
			return TableRef1.fromJSON({
				...tableSchema.name().jsonfy({ nodeNames: false }),
				result_schema: tableSchema,
				qualifier: qualifierJson
			});
		};

		// Resolve from outputSchemas first?
		if (transformer && this.canReferenceInlineTables()) {
			let statementContext = transformer.statementContext
			do {
				for (const tableSchema of statementContext.artifacts.get('tableSchemas')) {
					resultSet = resultSet.concat(resolve(tableSchema) || []);
					if (!inGrepMode && resultSet.length) break; // Matching current instance only
				}
			} while ((inGrepMode || !resultSet.length) && (statementContext = statementContext.superContext?.statementContext))
		}

		// Resolve normally?
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
				true
			));
		}

		return resultSet;
	}

	jsonfy(options = {}, transformer = null, linkedDb = null) {
		let resultJson;

		if ((options.deSugar || options.fullyQualified)
			&& this.value() !== '*'
			&& !this.qualifier()
			&& !this.ddlSchema()
			&& (transformer || linkedDb)) {
			resultJson = this.resolve(transformer, linkedDb).jsonfy(/* IMPORTANT */);
		} else {
			resultJson = super.jsonfy(options, transformer, linkedDb);
		}

		if (options.deSugar && resultJson.version_spec) {
			resultJson = { version_spec: undefined, ...resultJson };
		}

		return resultJson;
	}
}