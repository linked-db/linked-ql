import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { QualifierMixin } from './abstracts/QualifierMixin.js';

export class ComputedColumnRef extends QualifierMixin(AbstractClassicRef) {

    /* SYNTAX RULES */

    static get _refKind() { return 'column'; }

    static get _qualifierType() { return 'ComputedTableRef'; }

    static get syntaxRules() {
        return [
            {
                optional: true,
                syntaxes: [
                    [
                        { type: 'LQBackRefConstructor', as: 'qualifier', peek: [1, 'punctuation', '.'] },
                        { type: 'punctuation', value: '.', assert: true, autoSpacing: false },
                    ],
                    [
                        { type: this._qualifierType, as: 'qualifier', peek: [1, 'version_spec'] },
                        { type: 'punctuation', value: '.', assert: true, autoSpacing: false },
                    ],
                    [
                        { type: this._qualifierType, as: 'qualifier', peek: [1, 'punctuation', '.'] },
                        { type: 'punctuation', value: '.', assert: true, autoSpacing: false },
                    ],
                ],
            },
            {
                syntaxes: [
                    { ...[].concat(super.syntaxRules)[0] },
                    { type: 'operator', as: '.', value: '*' },
                ],
                autoSpacing: false
            }
        ];
    }

    static get syntaxPriority() { return 51; } // above LQBackRefConstructor
}