
import Node from '../abstracts/Node.js';

export default class Prim extends Node {

	/**
	 * Instance properties
	 */
	VALUE;

	/**
	 * @constructor
	 */
	constructor(context, value) {
		super(context);
		this.VALUE = value;
	}

	/**
	 * Sets the value to true
	 */
	true() { this.VALUE = true; }

	/**
	 * Sets the value to false
	 */
	false() { this.VALUE = false; }

	/**
	 * Sets the value to null
	 */
	null() { this.VALUE = null; }

	/**
	 * @inheritdoc
	 */
	toJson() { return this.VALUE; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (![true,false,null].includes(json)) return;
		return new this(context, json);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.VALUE }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		if (!/^(TRUE|FALSE|NULL)$/i.test(expr)) return;
		return new this(context, JSON.parse(expr));
	}
}