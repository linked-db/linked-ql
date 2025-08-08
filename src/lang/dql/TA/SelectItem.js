import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class SelectItem extends DDLSchemaMixin(AbstractNode) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['Expr', 'MYVarAssignmentExpr'], as: 'expr' },
            {
                optional: true,
                syntaxes: [
                    { type: 'BasicAlias', as: 'alias' },
                    [
                        { type: 'keyword', as: 'as_kw', value: 'AS', booleanfy: true },
                        { type: 'BasicAlias', as: 'alias', assert: true }
                    ]
                ]
            }
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    asKW() { return this._get('as_kw'); }

    alias() { return this._get('alias'); }

    /* SCHEMA API */

    deriveAlias() {

        let aliasJson = this.alias()?.jsonfy();

        let exprNode = this.expr();

        // Resolve RowConstructor
        if (exprNode instanceof registry.RowConstructor) {
            exprNode = exprNode.exprUnwrapped();
        }

        // Resolve CastExpr | PGCastExpr2
        if (exprNode instanceof registry.CastExpr || exprNode instanceof registry.PGCastExpr2) {
            exprNode = exprNode.expr();
        }

        if (!aliasJson) {
            if (exprNode instanceof registry.ColumnRef1) {
                aliasJson = { value: exprNode.value(), delim: exprNode._get('delim') };
            } else if (exprNode instanceof registry.LQDeepRef1 && exprNode.endpoint() instanceof registry.ColumnRef2) {
                const endpointNode = exprNode.endpoint();
                aliasJson = { value: endpointNode.value(), delim: endpointNode._get('delim') };
            } else {
                const isToPG = this.options.dialect === 'postgres';
                if (exprNode instanceof registry.CallExpr && isToPG) {
                    aliasJson = { value: exprNode.name().toLowerCase() };
                } else {
                    aliasJson = { value: isToPG ? '?column?' : exprNode.stringify() };
                }
            }
        }

        return registry.BasicAlias.fromJSON(aliasJson);
    }

    jsonfy(options = {}, linkedContext = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, linkedContext, linkedDb);
        if (options.deSugar) {
            const alias = resultJson.alias || this.deriveAlias().jsonfy();
            let result_schema = resultJson.expr.result_schema;
            if (!result_schema) {
                result_schema = registry.ColumnSchema.fromJSON({
                    name: { ...alias, nodeName: registry.Identifier.NODE_NAME },
                    data_type: this.expr().dataType().jsonfy(),
                });
            }
            resultJson = {
                ...resultJson,
                alias,
                result_schema,
            };
        }
        return resultJson;
    }
}