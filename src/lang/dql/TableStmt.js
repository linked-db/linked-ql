import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { registry } from '../registry.js';

export class TableStmt extends AbstractNonDDLStmt {

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
            resultJson = {
                ...resultJson,
                result_schema: registry.JSONSchema.fromJSON({ entries: tableSchema.jsonfy().entries }),
                origin_schemas: [tableSchema], // or this.getOriginSchemas(transformer)
            };
        }
        return resultJson;
    }
}