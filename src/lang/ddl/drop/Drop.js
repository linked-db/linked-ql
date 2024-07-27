
import AbstractNode from '../AbstractNode.js';

export default class Drop extends AbstractNode {

	/**
	 * Instance props.
	 */
	NAME;

	/**
	 * @inheritdoc
	 */
	name(value = undefined) {
		if (!arguments.length) return this.NAME;
		return (this.NAME = value, this)
	}

	/**
	 * @inheritdoc
	 */
	toJson() { return { name: this.NAME, ...super.toJson(), }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		// At least one of them:
		if (!json?.kind && typeof json?.name !== 'string') return;
		return super.fromJson(context, json)?.name(json.name);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const restrictOrCascade = this.params.dialect !== 'mysql' && (this.getFlag('RESTRICT') || this.getFlag('CASCADE'));
		let kind = this.KIND?.replace(/_/g, ' '), name = this.NAME && this.autoEsc(this.NAME);
		if (['PRIMARY_KEY', 'FOREIGN_KEY', 'CHECK'].includes(this.KIND)) {
			if (this.params.dialect === 'mysql') {
				if (this.KIND === 'PRIMARY_KEY') { name = null; }
			} else { kind = 'CONSTRAINT'; }
		}
		return `${ this.CLAUSE }${ kind ? ` ${ kind }` : '' }${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' }${ name ? ` ${ name }` : '' }${ restrictOrCascade ? ` ${ restrictOrCascade }` : '' }`;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, kind = '', ifExists, name_unescaped, /*esc*/, name_escaped, restrictOrCascade ] = (new RegExp(`^${ this.CLAUSE }(?:\\s+(${ this.KINDS.map(s => s.replace(/_/g, '\\s+')).join('|') }))?(\\s+IF\\s+EXISTS)?(?:\\s+(\\w+)|\\s+([\`"])((?:\\4\\4|[^\\4])+)\\4)?(?:\\s+(RESTRICT|CASCADE))?$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.replace(/\s+/g, '_').toUpperCase());
		if (name_unescaped || name_escaped) instance.name(name_unescaped || this.autoUnesc(instance, name_escaped));
		if (ifExists) instance.withFlag('IF_EXISTS');
		if (restrictOrCascade) instance.withFlag(restrictOrCascade);
		return instance;
	}

	static get CLAUSE() { return 'DROP'; }
    static KINDS = ['COLUMN', 'CONSTRAINT', 'PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE_KEY', 'CHECK', 'INDEX', 'KEY', 'IDENTITY', 'EXPRESSION', 'DEFAULT', 'NOT_NULL', 'NULL', 'AUTO_INCREMENT', 'ON_UPDATE'];
}