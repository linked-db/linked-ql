import { ResultSchemaMixin } from '../../abstracts/ResultSchemaMixin.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class TableAbstraction2 extends ResultSchemaMixin(AbstractNode) {

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
        let derivedAlias;
        if (this.alias()) {
            derivedAlias = this.alias();
        } else {
            derivedAlias = registry.SelectItemAlias.fromJSON({
                as_kw: true,
                value: this.tableRef().value(),
                delim: this.tableRef()._get('delim'),
            });
        }
        return derivedAlias;
    }

    jsonfy(options = {}, transformer = null, dbContext = null) {
        let resultJson = super.jsonfy(options, transformer, dbContext);
        if (options.deSugar) {

            const derivedAliasJson = resultJson.alias || this.deriveAlias().jsonfy();

            const schemaIdent = {
                nodeName: registry.Identifier.NODE_NAME,
                value: derivedAliasJson.value,
                delim: derivedAliasJson.delim,
            };

            let resultSchema = resultJson.table_ref.result_schema.clone({ renameTo: schemaIdent });
            if (resultJson.alias) {
                resultSchema = resultSchema.clone({ renameTo: { nodeName: registry.Identifier.NODE_NAME, value: resultJson.alias.value, delim: resultJson.alias.delim } });
            }

            transformer.statementContext.artifacts.get('tableSchemas').add({ resultSchema });

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