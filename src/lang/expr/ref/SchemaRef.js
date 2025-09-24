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

    lookup(deepMatchCallback = null, transformer = null, dbContext = null) {
        if (!dbContext) return [];

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

        for (const schemaSchema of dbContext.catalog) {
            resultSet = resultSet.concat(resolve(schemaSchema) || []);
            if (!inGrepMode && resultSet.length) break; // Matching current instance only
        }

        return resultSet;
    }

    jsonfy(options = {}, transformer = null, dbContext = null) {
        let resultJson;
        if (options.deSugar
            && !this.resultSchema()
            && dbContext) {
            // Schema resolution...
            resultJson = this.resolve(transformer, dbContext).jsonfy(/* IMPORTANT */);
        } else {
            resultJson = super.jsonfy(options, transformer, dbContext);
        }
        // Case normalization...
        if ((options.deSugar === true || options.deSugar?.normalizeCasing) && !resultJson.delim) {
            resultJson = { ...resultJson, value: resultJson.value.toLowerCase() };
        }
        // Drop version specs...
        if ((options.deSugar === true || options.deSugar?.dropVersionSpecs) && resultJson.version_spec) {
            resultJson = { ...resultJson, version_spec: undefined };
        }
        return resultJson;
    }
}
