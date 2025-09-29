import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { ResultSchemaMixin } from '../../abstracts/ResultSchemaMixin.js';
import { registry } from '../../registry.js';

export class TableAbstraction1 extends ResultSchemaMixin(AbstractNode) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'TableRef1', as: 'table_ref' },
            {
                optional: true,
                dialect: 'mysql',
                syntax: [
                    { type: 'punctuation', value: '.', autoSpacing: false },
                    { type: 'operator', as: 'my_star_ref', value: '*', booleanfy: true, autoSpacing: false },
                ],
            },
            { type: 'SelectItemAlias', as: 'alias', optional: true },
        ];
    }

    /* AST API */

    tableRef() { return this._get('table_ref'); }

    myStarRef() { return this._get('my_star_ref'); }

    alias() { return this._get('alias'); }

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

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let resultJson = super.jsonfy(options, transformer, schemaInference);
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

            const applicableAliasJson = (options.deSugar === true || options.deSugar?.tableAliases)
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