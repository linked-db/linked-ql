import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class TableAbstraction2 extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
            { type: 'TableRef1', as: 'table_ref', assert: true },
            { type: 'operator', as: 'pg_star_ref', value: '*', booleanfy: true, optional: true, dialect: 'postgres' },
            { type: 'SelectItemAlias', as: 'alias', optional: true },
        ];
    }

    /* AST API */

    tableRef() { return this._get('table_ref'); }

    alias() { return this._get('alias'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }

    /* SCHEMA API */

    deriveAlias() {
        let derivedAliasJson;
        if (this.alias()) {
            derivedAliasJson = { as_kw: true, value: this.alias().value(), delim: this.alias()._get('delim') };
        } else {
            derivedAliasJson = { as_kw: true, value: this.tableRef().value(), delim: this.tableRef()._get('delim') };
        }
        return registry.SelectItemAlias.fromJSON(derivedAliasJson);
    }

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (options.deSugar) {

            const derivedAliasJson = resultJson.alias || this.deriveAlias().jsonfy();

            const schemaIdent = {
                nodeName: registry.Identifier.NODE_NAME,
                value: derivedAliasJson.value,
                delim: derivedAliasJson.delim,
            };

            let resultSchema = resultJson.expr.result_schema.clone({ renameTo: schemaIdent });
            if (subResultJson.pg_table_alias) {
                resultSchema = resultSchema.clone({ renameTo: subResultJson.pg_table_alias });
            }

            transformer.statementContext.artifacts.get('tableSchemas').add({ type: 'dml', resultSchema });

            const applicableAliasJson = Number(options.deSugar) > 1
                && derivedAliasJson
                || resultJson.alias;
            resultJson = {
                ...resultJson,
                alias: applicableAliasJson,
                result_schema: resultSchema,
            };
        }

        return resultJson;
    }
}