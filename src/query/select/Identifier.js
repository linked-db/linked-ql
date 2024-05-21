
import Node from '../abstracts/Node.js';

export default class Identifier extends Node {
	
	/**
	 * Instance properties
	 */
	BASENAME;
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
		this.BASENAME = nameParts.pop();
		if (nameParts.length) throw new Error(`Idents can be maximum of two parts. Recieved: ${ nameParts.reverse().join('.') }.${ this.BASENAME }.${ this.NAME }`);
	}

	/**
	 * @inheritdoc
	 */
	toJson() { return { name: this.BASENAME ? [this.BASENAME,this.NAME] : this.NAME, flags: this.FLAGS }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json === 'string' || Array.isArray(json)) json = { name: json };
		else if (typeof json?.name !== 'string' && !Array.isArray(json?.name)) return;
		const instance = (new this(context)).withFlag(...(json?.flags || []));
		instance.name(json.name);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		return this.autoEsc([this.BASENAME, this.NAME].filter(s => s)).join('.') + (
			this.FLAGS.length ? ` ${ this.FLAGS.map(s => s.replace(/_/g, ' ')).join(' ') }` : ''
		);
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [name, basename] = this.parseIdent(context, expr, true) || [];
		if (!name) return;
		const instance = new this(context);
		instance.name(basename ? [basename,name] : name);
		return instance;
	}
}