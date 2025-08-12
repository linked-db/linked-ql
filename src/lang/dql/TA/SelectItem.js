import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class SelectItem extends DDLSchemaMixin(AbstractNode) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: ['ColumnRef0', 'Expr', 'MYVarAssignmentExpr'], as: 'expr' },
            { type: 'SelectItemAlias', as: 'alias', optional: true }
        ];
    }

    /* AST API */

    expr() { return this._get('expr'); }

    alias() { return this._get('alias'); }

    /* SCHEMA API */

    deriveAlias() {

        let derivedAliasJson = this.alias()?.jsonfy();

        let exprNode = this.expr();

        // Resolve RowConstructor
        if (exprNode instanceof registry.RowConstructor) {
            exprNode = exprNode.exprUnwrapped();
        }

        // Resolve CastExpr | PGCastExpr2
        if (exprNode instanceof registry.CastExpr 
            || exprNode instanceof registry.PGCastExpr2) {
            exprNode = exprNode.expr();
        }

        if (!derivedAliasJson) {
            if (exprNode instanceof registry.ColumnRef1) {
                derivedAliasJson = { as_kw: true, value: exprNode.value(), delim: exprNode._get('delim') };
            } else if (exprNode instanceof registry.LQDeepRef1 && exprNode.endpoint() instanceof registry.ColumnRef2) {
                const endpointNode = exprNode.endpoint();
                derivedAliasJson = { as_kw: true, value: endpointNode.value(), delim: endpointNode._get('delim') };
            } else if (!(exprNode instanceof registry.ColumnRef0)) {
                const isToPG = this.options.dialect === 'postgres';
                if (exprNode instanceof registry.CallExpr && isToPG) {
                    derivedAliasJson = { as_kw: true, value: exprNode.name().toLowerCase() };
                } else {
                    derivedAliasJson = { as_kw: true, value: isToPG ? '?column?' : exprNode.stringify() };
                }
            }
        }

        return registry.SelectItemAlias.fromJSON(derivedAliasJson);
    }

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (options.deSugar) {

            const derivedAliasNode = this.deriveAlias();
            let asAggr, derivedAliasJson = derivedAliasNode && (transformer
                ? transformer.transform(derivedAliasNode, ($options = options) => derivedAliasNode.jsonfy($options), 'alias', options)
                : derivedAliasNode.jsonfy(options));
            if (derivedAliasJson?.is_aggr) ({ is_aggr: asAggr, ...derivedAliasJson } = derivedAliasJson);

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

            const schemaIdent = derivedAliasJson && { nodeName: registry.Identifier.NODE_NAME, value: derivedAliasJson.value, delim: derivedAliasJson.delim };

            let result_schema = exprJson.result_schema;

            if (result_schema instanceof registry.ColumnSchema) {
                const tableSchema = result_schema.parentNode;
                result_schema = result_schema.clone({ renameTo: schemaIdent });
                tableSchema._adoptNodes(result_schema);
            } else if (derivedAliasJson 
                && !(exprNode instanceof registry.LQDeepRef1) 
                && !(exprNode instanceof registry.ColumnRef0)) {
                result_schema = registry.ColumnSchema.fromJSON({
                    name: schemaIdent,
                    data_type: this.expr().dataType().jsonfy(),
                });
                exprNode._adoptNodes(result_schema);
            }

            const applicableAliasJson = (Number(options.deSugar || 0) > 1 || asAggr) 
                && derivedAliasJson
                || resultJson.alias;
            return {
                nodeName: SelectItem.NODE_NAME,
                expr: exprJson,
                alias: applicableAliasJson,
                result_schema,
            };
        }
        return super.jsonfy(options, transformer, linkedDb);
    }
}