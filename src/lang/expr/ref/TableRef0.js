import { TableRef1 } from './TableRef1.js';
import { registry } from '../../registry.js';

export class TableRef0 extends TableRef1 {

    /* SYNTAX RULES */

    static get _qualifierType() { return ['SchemaRef']; }

    static get syntaxRules() {
        return this.buildSyntaxRules({ type: 'operator', as: '.', value: '*', autoSpacing: false });
    }

    static get syntaxPriority() { return -1; }

    /* API */

    dataType() { return registry.DataType.fromJSON({ value: 'SET' }); }
}