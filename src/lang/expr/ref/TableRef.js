import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class TableRef extends IdentifierPath {

	/* SYNTAX RULES */

	static get _domainKind() { return 'table'; }

	static get _qualifierType() { return 'DatabaseRef'; }

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

    jsonfy(options = {}, transformCallback = null) {
		let { version_spec, ...resultJson } = super.jsonfy(options, transformCallback);
		if (!options.deSugar && version_spec) {
			resultJson = { version_spec, ...resultJson };
		}
		return resultJson;
	}
}