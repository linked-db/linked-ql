
import { _isObject } from '@webqit/util/js/index.js';
import AbstractNode from '../AbstractNode.js';

export default class Identifier extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	NAME;
	PREFIX;

	/**
	 * Sets or gets the name.
	 * 
	 * @param String name
	 * 
	 * @returns this
	 */
	name(name) {
		if (!arguments.length) return this.NAME;
		if (_isObject(name) || Array.isArray(name)) throw new TypeError(`Invalid object or array.`);
		return (this.NAME = name, this);
	}

	/**
	 * Sets or gets the prefix.
	 * 
	 * @param String prefix
	 * 
	 * @returns this
	 */
	prefix(prefix) {
		if (!arguments.length) return this.PREFIX;
		return (this.PREFIX = prefix, this);
	}

	toJSON() {
		return {
			name: this.NAME,
			prefix: this.PREFIX,
			...(this.FLAGS.length ? { flags: this.FLAGS.slice() } : {} )
		};
	}

	static fromJSON(context, json) {
		if (typeof json === 'string') json = { name: json };
		else if (Array.isArray(json) && json.some(s => typeof s === 'string') && (json = json.slice())) {
			json = { name: json.pop(), prefix: json.pop() };
		} else if (typeof json?.name !== 'string') return;
		const instance = (new this(context)).withFlag(...(json?.flags || []));
		instance.name(json.name).prefix(json.prefix);
		return instance;
	}
	
	stringify() {
		return this.autoEsc([this.PREFIX, this.NAME].filter(s => s)).join('.') + (
			''//this.FLAGS.length ? ` ${ this.FLAGS.map(s => s.replace(/_/g, ' ')).join(' ') }` : ''
		);
	}
	
	static parse(context, expr) {
		if (/^(TRUE|FALSE|NULL)$/i.test(expr)) return;
		const [name, prefix] = this.parseIdent(context, expr, true) || [];
		if (!name) return;
		return (new this(context)).name(name).prefix(prefix);
	}
}