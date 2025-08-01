import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class ColumnRef extends IdentifierPath {

    /* SYNTAX RULES */

    static get _objectKind() { return 'Column'; }

    static get _qualifierType() { return ['TableAbstractionRef'/* must come first being primary */, 'LQBackRefConstructor']; }

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

	/* DESUGARING API */

	jsonfy(options = {}, transformCallback = null, linkedDb = null) {
		if (this.value() === '*' && (options.deSugar || options.fullyQualified)) {
            options = { deSugar: false, fullyQualified: false };
		}
		return super.jsonfy(options, transformCallback, linkedDb);
	}
}