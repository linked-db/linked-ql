import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class NamespaceRef extends AbstractClassicRef {

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

    lookup(deepMatchCallback = null, transformer = null, schemaInference = null) {
        if (!schemaInference) return [];

        const name = this._get('value');
        const inGrepMode = !name && !deepMatchCallback;
        let resultSet = [];

        const resolve = (namespaceSchema) => {
            if (!(namespaceSchema instanceof registry.NamespaceSchema)) return false;
            if (name && !namespaceSchema.identifiesAs(this)) return false;
            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(namespaceSchema))) return false;
            if (result instanceof AbstractNode || Array.isArray(result)) return result;

            const resolvedNamespaceRef1 = registry.ColumnRef2.fromJSON({
                ...namespaceSchema.name().jsonfy({ nodeNames: false }),
                result_schema: namespaceSchema
            });
            this.parentNode._adoptNodes(resolvedNamespaceRef1);

            return resolvedNamespaceRef1;
        };

        for (const namespaceSchema of schemaInference.catalog) {
            resultSet = resultSet.concat(resolve(namespaceSchema) || []);
            if (!inGrepMode && resultSet.length) break; // Matching current instance only
        }

        return resultSet;
    }

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let resultJson;
        if (options.deSugar
            && !this.resultSchema()
            && schemaInference) {
            // Schema resolution...
            resultJson = this.resolve(transformer, schemaInference).jsonfy(/* IMPORTANT */);
        } else {
            resultJson = super.jsonfy(options, transformer, schemaInference);
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
