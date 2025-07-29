import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { AggrCallExpr } from '../../expr/call/AggrCallExpr.js';
import { BasicAlias } from './BasicAlias.js';

export class SelectElement extends AbstractNode {

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

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null, linkedDb = null) {
        if (options.deSugar && this.alias()?.isAggr()) {
            // Note the below where we wrap value in an aggr call
            const exprJson = {
                nodeName: AggrCallExpr.NODE_NAME,
                name: (options.toDialect || this.options.dialect) === 'mysql' ? 'JSON_ARRAYAGG' : 'JSON_AGG',
                arguments: [this.expr().jsonfy/* @case1 */({ ...options, asAggr: true/* for use by any Back/DeefRef */ }, transformCallback, linkedDb)],
            };
            // Note the below instead of .jsonfy() as the former would still add the "[]" notation
            const aliasJson = {
                nodeName: BasicAlias.NODE_NAME,
                value: this.alias().value()
            };
            return {
                nodeName: SelectElement.NODE_NAME,
                expr: exprJson,
                as_kw: this.asKW(),
                alias: aliasJson
            };
        }
        return super.jsonfy(options, transformCallback, linkedDb);
    }
}