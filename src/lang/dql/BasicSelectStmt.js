import { Transformer } from '../Transformer.js';
import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { ErrorRefUnknown } from '../expr/ref/abstracts/ErrorRefUnknown.js';
import { JSONSchema } from '../abstracts/JSONSchema.js';
import { SelectStmt } from './SelectStmt.js';
import { registry } from '../registry.js';

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
                deferedItems.select_list.add(defaultTransform);
                return; // Exclude for now
            }

            // Process table abstraction nodes
            if (node instanceof registry.TableAbstraction3) {
                let conditionClauseTransform;


                let subResultJson = defaultTransform((node, defaultTransform, keyHint) => {
                    if (keyHint === 'condition_clause') {
                        conditionClauseTransform = defaultTransform;
                    } else return defaultTransform();
                });

                const result_schema = subResultJson.result_schema;
                transformer.artifacts.get('tableSchemas').add(result_schema);

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
                return defaultTransform((childNode, defaultChildTransform) => {
                    if (childNode.parentNode === node) {
                        try {
                            deferedItems[keyHint].add(defaultChildTransform());
                        } catch (e) {
                            if (e instanceof ErrorRefUnknown && childNode.expr() instanceof registry.ColumnRef1) {
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

        // Run transform
        let resultJson = super.jsonfy(options, transformer, linkedDb);

        // --------------

        // Resolve deferred items
        for (const [fieldName, deferreds] of Object.entries(deferedItems)) {
            let resolvedEntries = [];
            for (let deferred of deferreds) {
                if (typeof deferred === 'function') {
                    deferred = deferred();
                }
                resolvedEntries.push(deferred);
            }
            if (fieldName === 'select_list') {
                // Finalize generated JOINS
                resultJson = this.applySelectorDimensions(resultJson, transformer, linkedDb, options);
                // Re-resolve output list for cases of just-added deep refs where in schemas wouldn't have been resolvable at the time
                resolvedEntries = resolvedEntries.map((fieldJson) => {
                    if (fieldJson.result_schema) return fieldJson;
                    const fieldNode = registry.SelectItem.fromJSON(fieldJson, this.options);
                    this._adoptNodes(fieldNode);
                    return fieldNode.jsonfy(options, transformer, linkedDb);
                });
                // Apply now
                resultJson = { ...resultJson, [fieldName]: resolvedEntries };
                transformer.artifacts.set('outputSchemas', new Set(resolvedEntries.map((e) => e.result_schema)));
            } else if (deferreds.size) {
                if (fieldName === 'having_clause') {
                    resultJson = { ...resultJson, [fieldName]: resolvedEntries[0] };
                } else if (fieldName === 'group_by_clause') {
                    resultJson = { ...resultJson, [fieldName]: { entries: resolvedEntries } };
                }
            }
        }

        // --------------

        // Resolve deep-refs schemas
        resultJson = {
            ...resultJson,
            select_list: resultJson.select_list.map((fieldJson) => {
                if (fieldJson.result_schema) return fieldJson;

                const fieldNode = registry.SelectItem.fromJSON(fieldJson, this.options);
                this._adoptNodes(fieldNode);

                return fieldNode.jsonfy(options, transformer, linkedDb);
            }),
        };

        // Derive output schema
        const result_schema = new JSONSchema({
            entries: resultJson.select_list.map((s) => s.result_schema.clone())
        });
        resultJson = { ...resultJson, result_schema };

        // --------------

        // Normalize special case LQObjectLiteral
        let selectList;
        if (options.deSugar
            && (selectList = this.selectList()).length === 1
            && selectList[0].expr() instanceof registry.LQObjectLiteral
            && !selectList[0].alias()
        ) {
            // Make pairs of arguments
            const [argPairs] = resultJson.select_list[0].expr.arguments.reduce(([argPairs, key], value) => {
                if (!key) return [argPairs, value];
                return [[...argPairs, [key, value]]];
            }, [[]]);

            const result_schemas = resultJson.select_list[0].expr.result_schema.entries();

            // Compose...
            resultJson = {
                ...resultJson,
                select_list: argPairs.map(([key, value], i) => ({
                    nodeName: registry.SelectItem.NODE_NAME,
                    expr: value,
                    alias: { ...key, nodeName: registry.BasicAlias.NODE_NAME },
                    as_kw: true,
                    result_schema: result_schemas[i],
                }))
            };
        }

        return resultJson;
    }
}