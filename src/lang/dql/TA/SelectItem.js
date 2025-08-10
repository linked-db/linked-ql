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
                aliasJson = exprNode.value() === '*' ? undefined : { value: exprNode.value(), delim: exprNode._get('delim') };
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

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (options.deSugar) {

            const aliasNode = this.alias() || this.deriveAlias();
            let asAggr, aliasJson = aliasNode && (transformer
                ? transformer.transform(aliasNode, ($options = options) => aliasNode.jsonfy($options), 'alias', options)
                : aliasNode.jsonfy(options));
            if (aliasJson?.is_aggr) ({ is_aggr: asAggr, ...aliasJson } = aliasJson);

            let exprNode = this.expr();

            let defaultExprTransform;

            if (asAggr && !(exprNode instanceof registry.LQDeepRef1)) {
                // Note the below where we wrap value in an aggr call
                defaultExprTransform = ($options = options, childTransformer = transformer) => ({
                    nodeName: registry.AggrCallExpr.NODE_NAME,
                    name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAYAGG' : 'JSON_AGG',
                    arguments: [exprNode.jsonfy($options, childTransformer, linkedDb)],
                });
            } else {
                // Note the below where we derive value, if not specified, from key
                defaultExprTransform = ($options = options, childTransformer = transformer) => {
                    return exprNode.jsonfy($options, childTransformer, linkedDb);
                };
            }

            const exprJson = transformer
                ? transformer.transform(exprNode, defaultExprTransform, 'expr', { ...options, asAggr })
                : defaultExprTransform();

            // ----------------

            const schemaIdent = aliasJson && { ...aliasJson, nodeName: registry.Identifier.NODE_NAME };

            let result_schema = exprJson.result_schema;

            if (result_schema instanceof registry.ColumnSchema) {
                const tableSchema = result_schema.parentNode;
                result_schema = result_schema.clone({ renameTo: schemaIdent });
                tableSchema._adoptNodes(result_schema);
            } else if (aliasJson && !(exprNode instanceof registry.LQDeepRef1)) {
                result_schema = registry.ColumnSchema.fromJSON({
                    name: schemaIdent,
                    data_type: this.expr().dataType().jsonfy(),
                });
                exprNode._adoptNodes(result_schema);
            }

            return {
                nodeName: SelectItem.NODE_NAME,
                expr: exprJson,
                alias: aliasJson,
                as_kw: !!aliasJson,
                result_schema,
            };
        }
        return super.jsonfy(options, transformer, linkedDb);
    }
}