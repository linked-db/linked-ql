
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

	$var(offset) { this.OFFSET = offset; }

	$bind(offset, value) {
		this.OFFSET = offset;
		const bindings = this.$trace('get:QUERY_BINDINGS');
		bindings?.push(value);
		if (this.OFFSET === 0) {
			this.OFFSET = bindings?.length;
		}
	}

	toJSON() { return { offset: this.OFFSET }; }

	static fromJSON(context, json) {
		if (typeof json?.offset !== 'number') return;
		return new this(context, json.offset);
	}
	
	stringify() { return this.params.dialect === 'mysql' ? '?' : '$' + this.OFFSET; }
	
	static parse(context, expr) {
		const notation = (context?.params?.inputDialect || context?.params?.dialect) === 'mysql' ? '?' : '$';
		const [ match, offset ] = (new RegExp(`^\\${ notation }(\\d)$`)).exec(expr) || [];
		if (!match) return;
		return new this(context, parseInt(offset));
	}
}
