import { registry } from '../../registry.js';
import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { Identifier } from './Identifier.js';

export class SchemaRef extends Identifier {

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

    /* API */

    selectSchema(filter = null, linkedDb = null) {
        if (!linkedDb) return [];

        const explicitEchemaName = this.value();
        const cs = this._has('delim');
        const searchPath = explicitEchemaName
            ? [explicitEchemaName] 
            : linkedDb.searchPath;

        for (const schemaName of searchPath) {
            const schemaSchema = [...linkedDb.catalog].find((s) => s instanceof registry.SchemaSchema && s.identifiesAs(schemaName, cs));
            if (!schemaSchema) {
                if (explicitEchemaName) throw new ErrorRefUnknown(`[${this.parentNode || this}] Unknown schema name ${this}.`);
                continue;
            }
            if (!filter || filter(schemaSchema)) {
                return [schemaSchema];
            }
        }

        return [];
    }

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null, linkedDb = null) {
		let { version_spec, ...resultJson } = super.jsonfy(options, transformCallback, linkedDb);

		if (!options.deSugar && version_spec) {
			resultJson = { version_spec, ...resultJson };
		}
        
		return resultJson;
	}
}
