import { ColumnRef2 } from './ColumnRef2.js';

export class LQBackRefEndpoint extends ColumnRef2 {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
			{
				optional: true,
                type: 'paren_block',
				syntax: { type: 'Identifier', as: 'qualifier' },
			},
			{ ...[].concat(super.syntaxRules)[0], peek: [1, 'operator', '<~'] },
		];
    }

    static get syntaxPriority() { return 52; } // Above ColumnRef1

    static morphsTo() { return ColumnRef2; }
    
    /* API */

    qualifier() { return this._get('qualifier'); }
}