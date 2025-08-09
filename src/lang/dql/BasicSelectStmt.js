import { Transformer } from '../Transformer.js';
import { SelectorStmtMixin } from '../abstracts/SelectorStmtMixin.js';
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

        const deferedSelectItems = new Set;
        let resultJson = {};

        const processOutputFields = () => {
            if (!deferedSelectItems.size) return;
            const select_list = [];
            for (const { node, defaultTransform } of deferedSelectItems) {
                const fieldJson = defaultTransform();
                if (!fieldJson) continue;
                const columnSchema = fieldJson.result_schema;
                transformer.artifacts.get('outputSchemas').add(columnSchema);
                select_list.push(fieldJson);
            }
            resultJson = { ...resultJson, select_list };
            deferedSelectItems.clear();
        };

        transformer = new Transformer((node, defaultTransform) => {

            // Defer SelectItem resolution
            if (node instanceof registry.SelectItem) {
                deferedSelectItems.add({ node, defaultTransform });
                return; // Exclude for now
            }

            // Process table abstraction nodes
            if (node instanceof registry.TableAbstraction3) {
                const resultJson = defaultTransform();
                const result_schema = resultJson.result_schema;
                console.log('__'+this, result_schema);
                transformer.artifacts.get('tableSchemas').add(result_schema);
                return resultJson;
            }

            // Trigger fields resolution
            if (node instanceof registry.GroupByClause
                || node instanceof registry.HavingClause
                || node instanceof registry.OrderByClause) {
                processOutputFields();
            }

            // For all other things...
            return defaultTransform();
        }, transformer, this);

        // Create the artifacts registries
        transformer.artifacts.set('outputSchemas', new Set);
        transformer.artifacts.set('tableSchemas', new Set);

        // Run transform
        resultJson = { ...resultJson, ...super.jsonfy(options, transformer, linkedDb) };
        // Trigger fields resolution if not yet
        processOutputFields();

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

        // Derive output schema
        const result_schema = new JSONSchema({
            entries: resultJson.select_list.map((s) => s.result_schema?.clone()).filter((s) => s)
        });
        resultJson = { ...resultJson, result_schema };

        return resultJson;
    }
}