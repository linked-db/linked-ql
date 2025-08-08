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

	lookup(deepMatchCallback, linkedContext = null, linkedDb = null) {
		if (!linkedContext && !linkedDb) return [];

		const inGrepMode = !this._get('value');
		let resultSet = [];

		const resolve = (tableSchema, qualifierJson = undefined) => {
			if (!(tableSchema instanceof registry.TableSchema)) return false;
			if (!(inGrepMode || tableSchema.identifiesAs(this))) return false;
			let result;
			if (deepMatchCallback && !(result = deepMatchCallback(tableSchema, qualifierJson))) return false;
			if (result instanceof AbstractNode) return result;
			return TableRef1.fromJSON({
				value: tableSchema.name().value(),
				result_schema: tableSchema,
				qualifier: qualifierJson
			});
		};

		// Resolve from outputSchemas first?
		if (linkedContext && this.canReferenceInlineTables()) {
			let statementContext = linkedContext.statementContext
			do {
				for (const tableSchema of statementContext.artifacts.get('tableSchemas')) {
					let result;
					if (result = resolve(tableSchema)) {
						resultSet.push(result);
						if (!inGrepMode) break; // Matching current instance only
					}
				}
			} while ((inGrepMode || !resultSet.length) && (statementContext = statementContext.superContext?.statementContext))
		}

		// Resolve normally?
		if (inGrepMode || !resultSet.length) {
			resultSet = resultSet.concat((new registry.SchemaRef(this.qualifier()?.jsonfy() || {})).lookup(
				(schemaSchema) => {
					return schemaSchema._get('entries').reduce((prev, tableSchema) => {
						if (prev) return prev;
						const newQualifierJson = {
							value: schemaSchema.name().value(),
							result_schema: schemaSchema
						};
						return resolve(tableSchema, newQualifierJson);
					}, null);
				},
				linkedContext,
				linkedDb,
				true
			));
		}

		return resultSet;
	}

	jsonfy(options = {}, linkedContext = null, linkedDb = null) {
		let resultJson;

		if ((options.deSugar || options.fullyQualified)
			&& this.value() !== '*'
			&& !this.qualifier()
			&& !this.ddlSchema()
			&& (linkedContext || linkedDb)) {
			resultJson = this.resolve(linkedContext, linkedDb).jsonfy(/* IMPORTANT */);
		} else {
			resultJson = super.jsonfy(options, linkedContext, linkedDb);
		}

		if (options.deSugar && resultJson.version_spec) {
			resultJson = { version_spec: undefined, ...resultJson };
		}

		return resultJson;
	}
}