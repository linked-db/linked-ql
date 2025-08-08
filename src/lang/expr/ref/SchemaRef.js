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

    lookup(deepMatchCallback, linkedContext = null, linkedDb = null) {
        if (!linkedDb) return [];

        const inGrepMode = !this._get('value');
        let resultSet = [];

        const resolve = (schemaSchema) => {
            if (!(schemaSchema instanceof registry.SchemaSchema)) return false;
            if (!(inGrepMode || schemaSchema.identifiesAs(this))) return false;
            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(schemaSchema))) return false;
            if (result instanceof AbstractNode) return result;
            return ColumnRef2.fromJSON({
                value: schemaSchema.name().value(),
                ddl_schema: schemaSchema.clone()
            });
        };

        for (const schemaSchema of linkedDb.catalog) {
            let result;
            if (result = resolve(schemaSchema)) {
                resultSet.push(result);
                if (!inGrepMode) break; // Matching current instance only
            }
        }

        return resultSet;
    }

    jsonfy(options = {}, linkedContext = null, linkedDb = null) {
        let resultJson;

        if (options.deSugar
            && !this.ddlSchema()
            && linkedDb) {
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
