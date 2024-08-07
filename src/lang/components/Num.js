
import AbstractNode from "../AbstractNode.js";

export default class Num extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	VALUE = 0;

	/**
	 * @constructor
	 */
	constructor(context, value) {
		super(context);
		this.VALUE = value;
	}

	/**
	 * Sets the value
	 * 
	 * @param String expr 
	 */
	value(value) { this.VALUE = value; }

	/**
	 * @inheritdoc
	 */
	toJson() { return { value: this.VALUE, flags: this.FLAGS, }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json === 'number' || (typeof json === 'string' && /^[.\d]+$/.test(json) && (json = parseFloat(json)))) {
			json = { value: json };
		} else if (typeof json?.value !== 'number') return;
		return (new this(context, json.value)).withFlag(...(json.flags || []));
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.VALUE }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		if (/^\d+$/.test(expr)) return new this(context, parseFloat(expr));
	}

	static factoryMethods = { value: (context, value) => /^\d+$/.test(value) && new this(context) };
}