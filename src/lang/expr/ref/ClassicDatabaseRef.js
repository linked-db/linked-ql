import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';

export class ClassicDatabaseRef extends AbstractClassicRef {

	/* SYNTAX RULES */

	static get syntaxRules() {
		return [
            ...[].concat(super.syntaxRules),
            { type: 'LQVersionSpec', as: 'version_spec', optional: true, autoSpacing: false }
        ];
	}

    static get syntaxPriority() { return -1; }

    /* DESUGARING API */

    versionSpec() { return this._get('version_spec'); }

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
