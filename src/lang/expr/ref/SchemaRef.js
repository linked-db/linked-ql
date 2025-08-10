import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class SchemaRef extends AbstractClassicRef {

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

    lookup(deepMatchCallback = null, transformer = null, linkedDb = null) {
        if (!linkedDb) return [];

        const name = this._get('value');
        const inGrepMode = !name && !deepMatchCallback;
        let resultSet = [];

        const resolve = (schemaSchema) => {
            if (!(schemaSchema instanceof registry.SchemaSchema)) return false;
            if (name && !schemaSchema.identifiesAs(this)) return false;
            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(schemaSchema))) return false;
			if (result instanceof AbstractNode || Array.isArray(result)) return result;
            
            const resolvedSchemaRef1 = ColumnRef2.fromJSON({
                ...schemaSchema.name().jsonfy({ nodeNames: false }),
                ddl_schema: schemaSchema
            });
            this.parentNode._adoptNodes(resolvedSchemaRef1);

            return resolvedSchemaRef1;
        };

        for (const schemaSchema of linkedDb.catalog) {
            resultSet = resultSet.concat(resolve(schemaSchema) || []);
            if (!inGrepMode && resultSet.length) break; // Matching current instance only
        }

        return resultSet;
    }

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson;

        if (options.deSugar
            && !this.ddlSchema()
            && linkedDb) {
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
