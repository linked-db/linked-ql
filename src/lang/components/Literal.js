
import AbstractNode from '../AbstractNode.js';

export default class Literal extends AbstractNode {

	/**
	 * Instance properties
	 */
	VALUE;

	/**
	 * Sets the value to true
	 */
	true() { return (this.VALUE = true, this); }

	/**
	 * Sets the value to false
	 */
	false() { return (this.VALUE = false, this); }

	/**
	 * Sets the value to null
	 */
	null() { return (this.VALUE = null, this); }

	/**
	 * Sets the value to an SQL literal
	 */
	sql(value) { return (this.VALUE = value, this); }

	/**
	 * @inheritdoc
	 */
	toJson() { return this.VALUE; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		const instance = new this(context);
		if (json == true) return instance.true();
		if (json == false) return instance.false();
		if (json == null) return instance.null();
		return instance.sql(json);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.VALUE }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const instance = new this(context);
		if (/^TRUE$/i.test(expr)) return instance.true();
		if (/^FALSE$/i.test(expr)) return instance.false();
		if (/^NULL$/i.test(expr)) return instance.null();
		return instance.sql(expr);
	}
}