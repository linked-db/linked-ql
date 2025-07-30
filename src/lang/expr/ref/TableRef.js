import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class TableRef extends IdentifierPath {

	/* SYNTAX RULES */

	static get _objectKind() { return 'Table'; }

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

	/* DESUGARING API */

	jsonfy(options = {}, transformCallback = null, linkedDb = null) {
		let { version_spec, ...resultJson } = super.jsonfy(options, transformCallback, linkedDb);
		if (!options.deSugar && version_spec) {
			resultJson = { version_spec, ...resultJson };
		}
		return resultJson;
	}
}