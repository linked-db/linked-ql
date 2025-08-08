import { TypeSysMixin } from '../../abstracts/TypeSysMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';

export class CaseExpr extends TypeSysMixin(AbstractNodeList) {

    /* DEFS */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'CASE' },
            { type: 'Expr', as: 'subject', optional: true },
            { type: 'CaseBranch', as: 'entries', arity: { min: 1 }, assert: true, autoIndent: 2 },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', value: 'ELSE' },
                    { type: 'Expr', as: 'alternate', autoIndent: true },
                ],
                autoSpacing: '\n',
            },
            { type: 'keyword', value: 'END', autoSpacing: '\n' },
        ];
    }

    /* AST API */

    subject() { return this._get('subject'); }
    
    branches() { return this.entries(); }

    alternate() { return this._get('alternate'); }
}