import { AbstractAction } from '../../abstracts/AbstractAction.js';
import { AbstractReferenceMixin } from '../../abstracts/AbstractReferenceMixin.js';
import { Identifier } from '../../../expr/Identifier.js';
import { ColumnRef } from '../../../expr/refs/ColumnRef.js';

export class Drop extends AbstractReferenceMixin(AbstractAction) {
	static get EXPECTED_KINDS() {
		return {
			COLUMN: ['COLUMN'],
			CONSTRAINT: ['PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE_KEY', 'CHECK'],
			INDEX: ['INDEX'],
		};
	}

    static get REF_TYPES() {
        return {
            COLUMN: [ColumnRef],
            CONSTRAINT: [Identifier],
			INDEX: [Identifier],
        };
    }

	static parse(context, expr, parseCallback) {
		const KINDS = Object.keys(this.EXPECTED_KINDS);
		const $KINDS = context?.params?.dialect === 'mysql'
			? [...new Set(KINDS.reduce((kinds, k) => kinds.concat(k, this.EXPECTED_KINDS[k]), []))]
			: KINDS;
		const [ wholeMatch, kindExp = 'COLUMN', ifExists, referenceExpr, restrictCascadeForce ] = expr.match(new RegExp(`^DROP(?:\\s+(${$KINDS.map(s => s.replace(/_/gi, '\\s+')).join('|')})(\\s+IF\\s+EXISTS)?)?(?:\\s+([\\s\\S]+?)(?:\\s+(RESTRICT|CASCADE|FORCE))?)?$`, 'i')) || [];
		if (!wholeMatch) return;
		const $KIND = kindExp.replace(/\s+/g, '_').toUpperCase();
		const KIND = KINDS.includes($KIND) ? $KIND : KINDS.find(k => this.EXPECTED_KINDS[k].includes($KIND));
		if (!KIND) return;
		const instance = new this(context, KIND, $KIND);
		if (ifExists) instance.withFlag('IF_EXISTS');
		if (restrictCascadeForce) instance.withFlag(restrictCascadeForce);
		if (referenceExpr) instance.reference(parseCallback(instance, referenceExpr, this.REF_TYPES[KIND]));
		return instance;
	}

	stringify() {
		const sql = ['DROP', this.params.dialect === 'mysql' ? this.$KIND.replace(/_/g, ' ') : this.KIND];
		if (this.hasFlag('IF_EXISTS')) sql.push('IF EXISTS');
		if (this.reference()) sql.push(this.reference());
		if (this.hasFlag('RESTRICT')) sql.push('RESTRICT');
		else if (this.hasFlag('CASCADE')) sql.push('CASCADE');
		else if (this.hasFlag('FORCE')) sql.push('FORCE');
		return sql.join(' ');
	}
}