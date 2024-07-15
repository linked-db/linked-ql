
import { _isNumeric } from '@webqit/util/js/index.js';
import Node from '../abstracts/Node.js';
		
export default class Placeholder extends Node {

	/**
	 * Instance properties
	 */
	OFFSET;

	/**
	 * @constructor
	 */
	constructor(context, offset) {
		super(context);
		this.OFFSET = parseInt(offset);
	}

	/**
	 * @inheritdoc
	 */
	$value(offset, value = undefined) {
		this.OFFSET = offset;
		if (arguments.length === 2) {
			this.statementNode.variables.push(value);
			if (this.OFFSET === 0) this.OFFSET = this.statementNode.variables.length;
		}
	}

	/**
	 * @inheritdoc
	 */
	toJson() { return { offset: this.OFFSET }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.offset !== 'number') return;
		return new this(context, json.offset);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return this.params.dialect === 'mysql' ? '?' : '$' + this.OFFSET; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const notation = (context?.params?.inputDialect || context?.params?.dialect) === 'mysql' ? '?' : '$';
		const [ match, offset ] = (new RegExp(`^\\${ notation }(\\d)$`)).exec(expr) || [];
		if (!match) return;
		return new this(context, parseInt(offset));
	}
}
