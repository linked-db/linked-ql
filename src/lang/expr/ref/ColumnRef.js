import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class ColumnRef extends IdentifierPath {

    /* SYNTAX RULES */

    static get _domainKind() { return 'column'; }

    static get _qualifierType() { return ['TableAbstractionRef', 'LQBackRefConstructor']; }

    static get syntaxRules() {
        return this.buildSyntaxRules({
            syntaxes: [
                { type: 'identifier', as: '.' },
                { type: 'operator', as: '.', value: '*' },
            ],
            autoSpacing: false
        });
    }

    static get syntaxPriority() { return 51; } // above LQBackRefConstructor
}