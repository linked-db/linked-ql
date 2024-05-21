
/**
 * @imports
 */
import LiteralInterface from './LiteralInterface.js';

/**
 * ---------------------------
 * Literal class
 * ---------------------------
 */				
export default class Literal extends LiteralInterface {

	/**
	 * @inheritdoc
	 */
	constructor(expr) {
		super();
		this.expr = expr;
	}
	 
	/**
	 * @inheritdoc
	 */
	eval() {
		return this.expr;
	}
	
	/**
	 * @inheritdoc
	 */
	toString() {
		return this.stringify();
	}
	
	/**
	 * @inheritdoc
	 */
	stringify(params = {}) {
		return this.expr;
	}
		
	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback = null, params = {}) {
		return new this(expr);
	}
}