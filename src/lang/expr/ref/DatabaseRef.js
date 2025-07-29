import { Identifier } from './Identifier.js';

export class DatabaseRef extends Identifier {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'identifier', as: '.' },
            { type: 'LQVersionSpec', as: 'version_spec', optional: true, autoSpacing: false }
        ];
    }

    static get syntaxPriority() { return -1; }

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

    /* API */

    selectSchema(filter = null) {
        const name = this.value();
        const rootSchemaInScope = this.capture('CONTEXT.ROOT_SCHEMA');
        const databasesSchemas = name
            ? [].concat(rootSchemaInScope?.database(name) || [])
            : rootSchemaInScope.databases();
        return filter ? databasesSchemas.filter(filter) : databasesSchemas;
    }
}
