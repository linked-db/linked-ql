import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';
import { _eq } from '../../util.js';

export class SelectList extends DDLSchemaMixin(AbstractNodeList) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return { type: 'SelectItem', as: 'entries', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 };
    }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (!options.deSugar) return resultJson;

        let resolvedOutputList = [];

        const shouldFlattenUnaliasedRootObjects = Number(options.deSugar) > 2;
        const shouldDedupe = false;

        const addOutputItem = (itemJson) => {
            if (shouldDedupe) {
                resolvedOutputList = resolvedOutputList.reduce((result, existing) => {
                    if (itemJson.alias && existing.alias && _eq(itemJson.alias.value, existing.alias.value, itemJson.alias.delim || existing.alias.delim)) {
                        return result;
                    }
                    return result.concat(existing);
                }, []);
            }
            resolvedOutputList = resolvedOutputList.concat(itemJson);
        };

        for (const [i, selectItemJson] of resultJson.entries.entries()) {

            if (selectItemJson.expr.value === '*') {
                for (const columnRef of selectItemJson.result_schema) {
                    const exprJson = columnRef.jsonfy();
                    const aliasJson = { nodeName: registry.SelectItemAlias.NODE_NAME, as_kw: true, value: exprJson.value, delim: exprJson.delim };
                    addOutputItem({
                        nodeName: registry.SelectItem.NODE_NAME,
                        expr: exprJson,
                        alias: aliasJson,
                        result_schema: exprJson.result_schema.clone(),
                        _originalStarJson: selectItemJson
                    });
                }
            } else if (shouldFlattenUnaliasedRootObjects
                && this.entries()[i]/* original */.expr() instanceof registry.LQObjectLiteral
                && !this.entries()[i]/* original */.alias()) {
                // Start by making pairs of arguments
                const [argPairs] = selectItemJson.expr.arguments.reduce(([argPairs, key], value) => {
                    if (!key) return [argPairs, value];
                    return [[...argPairs, [key, value]]];
                }, [[]]);

                const resultSchemas = selectItemJson.expr.result_schema.entries();

                for (let i = 0; i < argPairs.length; i++) {
                    addOutputItem({
                        nodeName: registry.SelectItem.NODE_NAME,
                        expr: argPairs[i][1],
                        alias: { ...argPairs[i][0], nodeName: registry.SelectItemAlias.NODE_NAME, as_kw: true },
                        result_schema: resultSchemas[i],
                    });
                }
            } else {
                addOutputItem(selectItemJson);
            }
        }

        return {
            ...resultJson,
            entries: resolvedOutputList,
        };
    }

    finalizeJSON(resultJson, transformer, linkedDb, options) {
        const shouldDeSugarStars = Number(options.deSugar) > 1;
        let starsFound;

        const [
            selectItems,
            outputSchemas
        ] = resultJson.entries.reduce(([a, b], { _originalStarJson, ...fieldJson }) => {

            if (_originalStarJson) {
                starsFound = true;
            }

            if (_originalStarJson && !shouldDeSugarStars) {
                if (!_originalStarJson.result_schema) {
                    _originalStarJson.result_schema = registry.JSONSchema.fromJSON({ entries: [] }, { assert: true });
                }
                _originalStarJson.result_schema._add('entries', fieldJson.result_schema);
                return [
                    a.concat(_originalStarJson),
                    b.concat(fieldJson.result_schema.clone())
                ];
            }

            if (!fieldJson.result_schema) {
                const fieldNode = registry.SelectItem.fromJSON(fieldJson, this.options);
                this._adoptNodes(fieldNode);
                fieldJson = fieldNode.jsonfy(options, transformer, linkedDb);
            }

            return [
                a.concat(fieldJson),
                b.concat(fieldJson.result_schema.clone())
            ];
        }, [[], []]);

        // Apply now
        resultJson = {
            ...resultJson,
            entries: starsFound && !shouldDeSugarStars ? [...new Set(selectItems)] : selectItems,
            result_schema: registry.JSONSchema.fromJSON({ entries: outputSchemas }, { assert: true }),
        };
        transformer.statementContext.artifacts.set('outputSchemas', new Set(outputSchemas));

        return resultJson;
    }
}