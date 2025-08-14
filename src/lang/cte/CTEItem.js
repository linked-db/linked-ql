import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';

export class CTEItem extends AbstractNonDDLStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'CTEItemAlias', as: 'alias', assert: true },
            { type: 'keyword', value: 'AS' },
            {
                optional: true,
                dialect: 'postgres',
                syntaxes: [
                    [
                        { type: 'operator', as: 'not_materialized_kw', value: 'NOT', booleanfy: true },
                        { type: 'keyword', value: 'MATERIALIZED', assert: true },
                    ],
                    { type: 'keyword', as: 'materialized', value: 'MATERIALIZED', booleanfy: true },
                ],
            },
            {
                type: 'paren_block',
                syntax: { type: ['SelectStmt', 'InsertStmt', 'UpsertStmt', 'UpdateStmt', 'DeleteStmt', 'TableStmt', 'ValuesConstructor'], as: 'expr', autoIndent: true },
            },
            { type: 'PGSearchClause', as: 'search_clause', optional: true },
            { type: 'PGCycleClause', as: 'cycle_clause', optional: true },
        ];
    }

    /* AST API */

    alias() { return this._get('alias'); }

    notMaterializedKW() { return this._get('not_materialized_kw'); }

    materialized() { return this._get('materialized'); }

    expr() { return this._get('expr'); }

    searchClause() { return this._get('search_clause'); }

    cycleClause() { return this._get('cycle_clause'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (options.deSugar) {

            const schemaIdent = {
                nodeName: registry.Identifier.NODE_NAME,
                value: resultJson.alias.value,
                delim: resultJson.alias.delim,
            };

            let resultSchema = resultJson.expr.result_schema;

            if (resultSchema instanceof registry.TableSchema) {
                resultSchema = resultSchema.clone({ renameTo: schemaIdent });
            } else {
                resultSchema = registry.TableSchema.fromJSON({
                    name: schemaIdent,
                    entries: resultSchema?.entries().map((s) => s.jsonfy()) || [],
                });
            }

            if (resultJson.alias.columns?.length) {
                if (resultJson.alias.columns.length !== resultSchema.length) {
                    throw new SyntaxError(`[${this}] Number of column aliases must match number of result columns.`);
                }
                resultSchema = resultSchema.clone({}, new Transformer((node, defaultTransform, key) => {
                    if (typeof key === 'number' && node.parentNode === resultSchema) {
                        if (node instanceof registry.ColumnSchema) {
                            return node.jsonfy({ renameTo: resultJson.alias.columns[key] });
                        }
                        return {
                            ...node.jsonfy(),
                            nodeName: registry.ColumnSchema.NODE_NAME,
                            name: resultJson.alias.columns[key],
                        };
                    }
                    return defaultTransform();
                }));
            }

            transformer.statementContext.artifacts.get('tableSchemas').add({ type: 'CTEItem', resultSchema });

            resultJson = {
                ...resultJson,
                result_schema: resultSchema,
            };
        }

        return resultJson;
    }
}