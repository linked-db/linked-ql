

import Literal from '../../components/Literal.js';
import Modify from './Modify.js';
import Add from '../create/Add.js';
import Drop from '../drop/Drop.js';
import Set from './Set.js';

export default class Alter extends Modify {

	/**
	 * Instance props.
	 */
	NAME;

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
	add(kind, argument) { return this.argument({ clause: 'ADD', kind, argument }); }

	/**
	 * @inheritdoc
	 */
	drop(kind) { return this.argument({ clause: 'DROP', kind }); }

	/**
	 * @inheritdoc
	 */
	set(kind, argument) { return this.argument({ clause: 'SET', kind, argument }); }

	/**
	 * @inheritdoc
	 */
	toJson() { return { name: this.NAME, ...super.toJson(), }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string') return;
		return super.fromJson(context, json)?.name(json.name);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.CLAUSE } ${ this.KIND } ${ this.autoEsc(this.NAME) } ${ this.ARGUMENT }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, kind, name_unescaped, /*esc*/, name_escaped, argumentExpr ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s).join('|') })\\s+(?:(\\w+)|([\`"])((?:\\3\\3|[^\\3])+)\\3)?\\s+([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		instance.name(name_unescaped || this.autoUnesc(instance, name_escaped));
		if (/^(DATA\+)?TYPE\s+/i.test(argumentExpr)) {
			instance.argument(parseCallback(instance, `SET ${ argumentExpr }`, [Set]));
		} else {
			instance.argument(parseCallback(instance, argumentExpr, this.NODE_TYPES));
		}
		return instance;
	}

	static get CLAUSE() { return 'ALTER'; }
	static NODE_TYPES = [Add,Drop,Set,Literal];
    static KINDS = ['COLUMN', 'CONSTRAINT', 'INDEX'];
}