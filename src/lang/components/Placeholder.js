
import AbstractNode from '../AbstractNode.js';
		
export default class Placeholder extends AbstractNode {

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
	$var(offset) { this.OFFSET = offset; }

	/**
	 * @inheritdoc
	 */
	$bind(offset, value) {
		this.OFFSET = offset;
		const bindings = this.$trace('get:node:statement.bindings');
		bindings?.push(value);
		if (this.OFFSET === 0) {
			this.OFFSET = bindings?.length;
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
