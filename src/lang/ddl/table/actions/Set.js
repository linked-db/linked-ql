import { AbstractAction } from '../../abstracts/AbstractAction.js';
import { AbstractArgumentMixin } from '../../abstracts/AbstractArgumentMixin.js';
import { DatabaseRef } from '../../../expr/refs/DatabaseRef.js';

export class Set extends AbstractArgumentMixin(AbstractAction) {
    static get EXPECTED_TYPES() {
        return { SCHEMA: [DatabaseRef] };
    }

	static parse(context, expr, parseCallback) {
        const [, kindExpr, argumentExpr] = (new RegExp(`^SET\\s+(${Object.keys(this.EXPECTED_TYPES).map(k => k.replace(/_/g, '\\s+')).join('|')})\\s+([\\s\\S]+)$`, 'i')).exec(expr) || [];
        if (!kindExpr) return;
        const instance = new this(context, kindExpr.replace(/s+/g, '_').toUpperCase());
        return instance.argument(parseCallback(instance, argumentExpr, this.EXPECTED_TYPES[instance.KIND]));
    }

    stringify() { return `SET ${this.KIND.replace(/_/g, ' ')} ${this.argument()}`; }
}