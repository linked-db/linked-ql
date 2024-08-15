
import Lexer from '../../Lexer.js';
import AbstractNode from '../../AbstractNode.js';
import Expr from '../Expr.js';

export default class StrJoin extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	STRINGS = [];

	/**
	 * @inheritdoc
	 */
	join(...strings) { return this.build('STRINGS', strings, Expr.Types); }

	/**
	 * @inheritdoc
	 */
	toJSON() { return { strings: this.STRINGS.map(str => str.toJSON()), flags: this.FLAGS, }; }

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if (!Array.isArray(json?.strings)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.join(...json.strings);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return this.STRINGS.join(' || '); }
	 
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		if ((context?.params?.inputDialect || context?.params?.dialect) === 'mysql') return;
		const tokens = Lexer.split(expr, [`||`]);
		if (tokens.length < 2) return;
		const instance = new this(context);
		instance.join(...tokens.map(expr => parseCallback(instance, expr.trim())));
		return instance;
	}
}
