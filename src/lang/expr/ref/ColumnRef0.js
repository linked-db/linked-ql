import { ColumnRef1 } from './ColumnRef1.js';
import { registry } from '../../registry.js';

export class ColumnRef0 extends ColumnRef1 {

    /* SYNTAX RULES */

    static get _qualifierType() { return ['TableRef1']; }

    static get syntaxRules() {
        return this.buildSyntaxRules({ type: 'operator', as: '.', value: '*', autoSpacing: false });
    }

    static get syntaxPriority() { return -1; }

    /* API */

    dataType() { return registry.DataType.fromJSON({ value: 'SET' }); }
}