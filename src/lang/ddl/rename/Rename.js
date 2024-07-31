
import AbstractNode from '../AbstractNode.js';

export default class Rename extends AbstractNode {

	/**
	 * Instance props.
	 */
	NAME;
	ARGUMENT;

	/**
	 * @inheritdoc
	 */
	name(value = undefined) {
		if (!arguments.length) return this.NAME;
		return (this.NAME = value, this);
	}

	/**
	 * @inheritdoc
	 */
	argument(value = undefined) {
		if (!arguments.length) return this.ARGUMENT;
		return (this.ARGUMENT = value, this);
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
        return {
            name: this.NAME,
            argument: this.ARGUMENT,
			...super.toJson(),
        };
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if ((json?.kind && typeof json.name !== 'string') || typeof json?.argument !== 'string') return;
        return super.fromJson(context, json)?.name(json.name).argument(json.argument);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.CLAUSE }${ this.KIND ? ` ${ this.KIND }` : '' }${ this.NAME ? ` ${ this.autoEsc(this.NAME) }` : '' } TO ${ this.autoEsc(this.ARGUMENT) }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, kind = '', name_unescaped, /*esc*/, name_escaped, argument_unescaped, /*esc*/, argument_escaped ] = (new RegExp(`^${ this.CLAUSE }\\s+(?:(${ this.KINDS.map(s => s).join('|') })\\s+)?(?:(?:(\\w+)|([\`"])((?:\\3\\3|[^\\3])+)\\3)\\s+)?(?:TO|AS)\\s+(?:(\\w+)|([\`"])((?:\\6\\6|[^\\6])+)\\6)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.replace(/\s+/g, '_').toUpperCase());
		if (name_unescaped || name_escaped) instance.name(name_unescaped || this.autoUnesc(instance, name_escaped));
		instance.argument(argument_unescaped || this.autoUnesc(instance, argument_escaped));
		return instance;
	}

	static get CLAUSE() { return 'RENAME'; }
    static KINDS = ['COLUMN', 'CONSTRAINT', 'INDEX', 'KEY'];
}