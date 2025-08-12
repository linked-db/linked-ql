import { Transformer } from '../Transformer.js';
import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { ErrorRefUnknown } from '../expr/ref/abstracts/ErrorRefUnknown.js';
import { SelectStmt } from './SelectStmt.js';
import { registry } from '../registry.js';
import { _eq } from '../util.js';

export class BasicSelectStmt extends SelectorStmtMixin(
    SelectStmt
) {

    /* SYNTAX RULES */

    static get syntaxRules() { return this.buildSyntaxRules(1); }

    static get syntaxPriority() { return -1; }

    /* Schema API */

    distinctClause() { return this._get('distinct_clause'); }

    selectList() { return this._get('select_list'); }

    fromClause() { return this._get('from_clause'); }

    joinClauses() { return this._get('join_clauses'); }

    whereClause() { return this._get('where_clause'); }

    groupByClause() { return this._get('group_by_clause'); }

    havingClause() { return this._get('having_clause'); }

    windowClause() { return this._get('window_clause'); }

    // -- MySQL

    myPartitionClause() { return this._get('my_partition_clause'); }

    // --------

    get length() { return this.selectList()?.length ?? 0; }

    [Symbol.iterator]() { return (this.selectList() || [])[Symbol.iterator](); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (!options.deSugar) return super.jsonfy(options, transformer, linkedDb);

        const deferedItems = {
            select_list: new Set,
            group_by_clause: new Set,
            having_clause: new Set,
            order_by_clause: new Set,
        };

        transformer = new Transformer((node, defaultTransform, keyHint) => {

            // Defer SelectItem resolution
            if (node instanceof registry.SelectItem) {
                deferedItems.select_list.add({ node, defaultTransform });
                return; // Exclude for now
            }

            // Process table abstraction nodes
            if (node instanceof registry.FromItem) {
                let conditionClauseTransform;

                let subResultJson = defaultTransform((node, defaultTransform, keyHint) => {
                    if (keyHint === 'condition_clause') {
                        conditionClauseTransform = defaultTransform;
                    } else return defaultTransform();
                });

                const resultSchema = subResultJson.result_schema;
                transformer.artifacts.get('tableSchemas').add({ type: node.joinType?.(), lateral: node.lateralKW(), resultSchema });

                if (conditionClauseTransform) {
                    subResultJson = {
                        ...subResultJson,
                        condition_clause: conditionClauseTransform(),
                    };
                }

                return subResultJson;
            }

            // Trigger fields resolution
            if (node instanceof registry.GroupByClause
                || node instanceof registry.HavingClause
                || node instanceof registry.OrderByClause) {
                // Try to capture Linked QL's native GROUP BY clause that's derived
                // from a back ref, which won't resolve at this time because the relevant generated JOIN
                // hasn't been add
                return defaultTransform((childNode, defaultChildTransform, subKeyHint) => {
                    if ((typeof subKeyHint === 'number' || subKeyHint === 'expr'/* For Having clause */) && childNode.parentNode === node) {
                        try {
                            deferedItems[keyHint].add(defaultChildTransform());
                        } catch (e) {
                            if (e instanceof ErrorRefUnknown) {
                                deferedItems[keyHint].add(defaultChildTransform);
                            } else throw e;
                        }
                        return; // Exclude for now
                    }
                    return defaultChildTransform();
                });
            }

            // For all other things...
            return defaultTransform();
        }, transformer, this/* IMPORTANT */);

        // Create the artifacts registries
        transformer.artifacts.set('outputSchemas', new Set);
        transformer.artifacts.set('tableSchemas', new Set);

        // 0. Run transform
        let resultJson = super.jsonfy(options, transformer, linkedDb);

        // --------------

        // 1. Resolve deferred select items
        // Deep refs here are discovered and resolved.
        let resolvedSelectItems = [];
        let starsFound = false;

        const shouldFlattenUnaliasedRootObjects = Number(options.deSugar || 0) > 2;
        const shouldDeSugarStars = Number(options.deSugar || 0) > 2;
        const shouldDedupe = true;
        
        const addOutputItem = (itemJson) => {
            if (shouldDedupe) {
                resolvedSelectItems = resolvedSelectItems.reduce((result, existing) => {
                    if (_eq(itemJson.alias.value, existing.alias.value, itemJson.alias.delim || existing.alias.delim)) {
                        return result;
                    }
                    return result.concat(existing);
                }, []);
            }
            resolvedSelectItems = resolvedSelectItems.concat(itemJson);
        };

        for (const { node, defaultTransform } of deferedItems.select_list) {
            const selectItemJson = defaultTransform();

            if (selectItemJson.expr.value === '*') {
                starsFound = true;
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
                && node.expr() instanceof registry.LQObjectLiteral
                && !node.alias()) {
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

        // 2. Finalize generated JOINS
        // Generated JOINs are injected into the query
        resultJson = this.applySelectorDimensions(resultJson, transformer, linkedDb, options);

        // 3. Re-resolve select list for cases of just-added deep refs
        // wherein schemas wouldn't have been resolvable at the time but are needed at the GROUP BY step below
        // 4. Finalize select list for the last time, honouring given deSugaring level with regards to star selects "*"
        // and ofcos finalize output schemas
        const [
            select_list, 
            outputSchemas
        ] = resolvedSelectItems.reduce(([a, b], { _originalStarJson, ...fieldJson }) => {

            if (_originalStarJson && !shouldDeSugarStars) {
                if (!_originalStarJson.result_schema) {
                    _originalStarJson.result_schema = registry.JSONSchema.fromJSON({ entries: [] }, { assert: true });
                }
                _originalStarJson.result_schema.add(fieldJson.result_schema);
                return [
                    a.concat(_originalStarJson),
                    b.concat(fieldJson.result_schema)
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
            select_list: starsFound && !shouldDeSugarStars ? [...new Set(select_list)] : select_list,
            result_schema: registry.JSONSchema.fromJSON({ entries: outputSchemas }, { assert: true }),
        };
        transformer.artifacts.set('outputSchemas', new Set(outputSchemas));

        // --------------

        // 5. Resolve deferred GROUP BYs and HAVINGs
        // after having published artifacts.outputSchemas
        for (const [fieldName, deferreds] of Object.entries(deferedItems)) {
            if (fieldName === 'select_list' || !deferreds.size) continue;
            const resolveds = [];
            for (let deferred of deferreds) {
                if (typeof deferred === 'function') {
                    deferred = deferred();
                }
                resolveds.push(deferred);
            }
            if (fieldName === 'having_clause') {
                resultJson = { ...resultJson, [fieldName]: resolveds[0] };
            } else if (fieldName === 'group_by_clause') {
                resultJson = { ...resultJson, [fieldName]: { entries: resolveds } };
            }

        }

        return resultJson;
    }
}