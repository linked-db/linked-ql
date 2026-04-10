import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { registry } from '../registry.js';

export class TableStmt extends AbstractNonDDLStmt {

    static morphsTo() { return registry.CompleteSelectStmt; }

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'TABLE' },
            { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
            { type: 'TableRef2', as: 'table_ref', assert: true },
            { type: 'operator', as: 'pg_star_ref', value: '*', booleanfy: true, optional: true, dialect: 'postgres' },
        ];
    }

    /* AST API */

    tableRef() { return this._get('table_ref'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let resultJson = super.jsonfy({ ...options, forceDeSugar: options.deSugar }, transformer, schemaInference);

        if (options.deSugar) {
            const tableSchema = resultJson.table_ref.result_schema;
            const resultSchema = registry.JSONSchema.fromJSON({ entries: tableSchema.columns().filter((e) => !e.name().value().startsWith('__')).map((c) => c.jsonfy()) });
            resultJson = {
                ...resultJson,
                result_schema: resultSchema,
                origin_schemas: [tableSchema],
            };
        }

        if (options.toSelect) {
            resultJson = {
                nodeName: registry.CompleteSelectStmt.NODE_NAME,
                select_list: {
                    nodeName: registry.SelectList.NODE_NAME,
                    entries: resultJson.result_schema ? resultJson.result_schema.columns().map((col) => ({
                        nodeName: registry.SelectItem.NODE_NAME,
                        expr: { ...col.name().jsonfy(), nodeName: registry.ColumnRef1.NODE_NAME },
                        alias: { nodeName: registry.SelectItemAlias.NODE_NAME, value: col.name().value(), delim: col.name()._get('delim'), as_kw: true },
                    })) : [{
                        nodeName: registry.SelectItem.NODE_NAME,
                        expr: { nodeName: registry.ColumnRef0.NODE_NAME, value: '*' }
                    }]
                },
                from_clause: {
                    nodeName: registry.FromClause.NODE_NAME,
                    entries: [{
                        nodeName: registry.FromItem.NODE_NAME,
                        expr: { ...resultJson.table_ref, nodeName: registry.TableRef1.NODE_NAME }
                    }]
                },
                result_schema: resultJson.result_schema,
                origin_schemas: resultJson.origin_schemas,
            };
        }

        return resultJson;
    }
}