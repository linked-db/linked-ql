import { AbstractClassicExpr } from './AbstractClassicExpr.js';
import * as exprs from './index.js';

export class Expr extends AbstractClassicExpr {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return { type: ExprNamesInOrder, expression: 1 };
    }

    /* API */

    static [Symbol.hasInstance](instance) {
        return instance instanceof AbstractClassicExpr || instance.constructor.name in exprs;
    }
}

const ExprNames = Object.keys(exprs);
const ExprNamesInOrder = ExprNames.filter((k) => {
    return exprs[k] !== Expr && exprs[k].syntaxPriority !== -1;
}).sort((a, b) => {
    const comp = (exprs[b].syntaxPriority ?? 100) - (exprs[a].syntaxPriority ?? 100);
    if (comp === 0) return exprs[b].prototype.isPrototypeOf(exprs[a].prototype) ? -1 : 1;
    return comp;
});
