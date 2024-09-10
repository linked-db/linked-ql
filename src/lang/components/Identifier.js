
import AbstractNode from '../AbstractNode.js';

export default class Identifier extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	PREFIX;
	NAME;

	/**
	 * Sets the name.
	 * 
	 * @param Array|String name
	 * 
	 * @returns this
	 */
	name(name) {
		const nameParts = Array.isArray(name) ? [...name] : [name];
		this.NAME = nameParts.pop();
		this.PREFIX = nameParts.pop();
		if (nameParts.length) throw new Error(`Idents can be maximum of two parts. Recieved: ${ nameParts.join('.') }.${ this.PREFIX }.${ this.NAME }`);
		return this;
	}

	/**
	 * @inheritdoc
	 */
	toJSON() {
		const name = this.PREFIX ? [this.PREFIX,this.NAME] : this.NAME;
		return this.FLAGS.length ? { name, flags: this.FLAGS } : name;
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if ((typeof json === 'string') || (Array.isArray(json) && json.every(s => typeof s === 'string'))) json = { name: json };
		else if (typeof json?.name !== 'string' && !Array.isArray(json?.name)) return;
		const instance = (new this(context)).withFlag(...(json?.flags || []));
		instance.name(json.name);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		return this.autoEsc([this.PREFIX, this.NAME].filter(s => s)).join('.') + (
			''//this.FLAGS.length ? ` ${ this.FLAGS.map(s => s.replace(/_/g, ' ')).join(' ') }` : ''
		);
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		if (/^(TRUE|FALSE|NULL)$/i.test(expr)) return;
		const [name, prefix] = this.parseIdent(context, expr, true) || [];
		if (!name) return;
		const instance = new this(context);
		instance.name(prefix ? [prefix,name] : name);
		return instance;
	}
}