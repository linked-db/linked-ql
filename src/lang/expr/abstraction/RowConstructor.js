import { TypeSysMixin } from '../../abstracts/TypeSysMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';

export class RowConstructor extends TypeSysMixin(AbstractNodeList) {
        
    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntax: [
                {
                    type: 'paren_block',
                    syntax: { type: 'Expr', as: 'entries', arity: Infinity, itemSeparator, autoIndent: 2 },
                    autoIndent: true,
                    autoIndentAdjust: -1,
                },
            ],
        };
    }

    static get syntaxPriority() { return 49; } // Below all () shapes like LQBackRefAbstraction but above DerivedQuery 

    /* API */

    exprUnwrapped() {
        if (this._get('entries')?.length === 1 && this._get('entries')[0] instanceof RowConstructor) {
            return this._get('entries')[0].exprUnwrapped();
        }
        return this;
    }

    /* TYPESYS */

    dataType() { return registry.DataType.fromJSON({ value: 'SET' }); }
}