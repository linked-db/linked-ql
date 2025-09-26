import { Transformer } from '../Transformer.js';
import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
import { ErrorRefUnknown } from '../expr/ref/abstracts/ErrorRefUnknown.js';
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

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        if (!options.deSugar) return super.jsonfy(options, transformer, schemaInference);

        const deferedTransforms = {
            select_list: null,
            group_by_clause: new Set,
            having_clause: new Set,
            order_by_clause: new Set,
        };

        transformer = new Transformer((node, defaultTransform, keyHint) => {

            // Defer SelectItem resolution
            if (node instanceof registry.SelectList) {
                deferedTransforms.select_list = defaultTransform;
                return; // Exclude for now
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
                            deferedTransforms[keyHint].add(defaultChildTransform());
                        } catch (e) {
                            if (e instanceof ErrorRefUnknown) {
                                deferedTransforms[keyHint].add(defaultChildTransform);
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

        // --------------

        // 0. Run transform
        let resultJson = super.jsonfy(options, transformer, schemaInference);

        // 1. Transform the defered selectList
        let selectListJson = deferedTransforms.select_list();

        // 2. Finalize generated JOINS
        // Generated JOINs are injected into the query
        const { select_list: _, ..._resultJson } = this.finalizeSelectorJSON(resultJson, transformer, schemaInference, options);

        // 3. Re-resolve output list for cases of just-added deep refs in selectList
        // wherein schemas wouldn't have been resolvable at the time
        // 4. Finalize output list for the last time, honouring given deSugaring level with regards to star selects "*"
        // and ofcos finalize output schemas
        selectListJson = this.selectList().finalizeJSON(selectListJson, transformer, schemaInference, options);

        // Apply now
        resultJson = {
            select_list: selectListJson,
            ..._resultJson,
            result_schema: selectListJson.result_schema,
            origin_schemas: this.getOriginSchemas(transformer),
        };

        // --------------

        // 5. Resolve deferred GROUP BYs and HAVINGs
        // after having published artifacts.outputSchemas
        for (const [fieldName, deferreds] of Object.entries(deferedTransforms)) {

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