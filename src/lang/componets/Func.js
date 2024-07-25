
import Lexer from '../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import Expr from './Expr.js';

export default class Func extends AbstractNode {

	/**
	 * Instance properties
	 */
	NAME = '';
	ARGS = [];
	
	/**
	 * @inheritdoc
	 */
	fn(name, ...args) {
		this.NAME = name;
		return this.build('ARGS', args, Expr.Types);
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			name: this.NAME,
			args: this.ARGS.map(o => o.toJson()),
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string' || !Array.isArray(json.args)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.fn(json.name, ...json.args);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.NAME.toUpperCase() }(${ this.ARGS.join(', ') })`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		if (!expr.endsWith(')') || Lexer.match(expr, [' ']).length) return;
		const [ , name, args = '' ] = /^(\w+)\(([\s\S]+)?\)$/i.exec(expr);
		const instance = new this(context);
		instance.fn(name, ...Lexer.split(args, [',']).map(arg => parseCallback(instance, arg.trim())));
		return instance;
	}
}