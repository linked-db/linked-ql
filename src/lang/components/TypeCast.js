import Lexer from '../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import Expr from './Expr.js';

export default class TypeCast extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	OPERAND = null;
	TYPE = '';
	SYNTAX2 = false;

	cast(operand, type, syntax2 = false) {
		this.TYPE = type;
		this.SYNTAX2 = syntax2;
		return this.build('OPERAND', [operand], Expr.Types);
	}

	toJSON() {
		return {
			operand: this.OPERAND?.toJSON(),
			type: this.TYPE,
			syntax2: this.SYNTAX2,
			flags: this.FLAGS
		};
	}

	static fromJSON(context, json) {
		if (!json?.operand || !json?.type) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.cast(json.operand, json.type, json.syntax2);
		return instance;
	}
	
	stringify() {
		if (this.SYNTAX2) return `${ this.OPERAND }::${ this.TYPE }`;
		return `CAST(${ this.OPERAND } AS ${ this.TYPE })`;
	}
	 
	static parse(context, expr, parseCallback) {
		let operand, type, syntax2 = false;
		if (/^CAST(?:\s+)?\([\s\S]+\)$/i.test(expr)) {
			const [ , parens ] = Lexer.split(expr, []);
			[operand, type] = Lexer.split(parens.slice(1, -1), [`AS`], { useRegex: 'i' });
		} else {
			if ((context?.params?.inputDialect || context?.params?.dialect) === 'mysql') return;
			[operand, type] = Lexer.split(expr, [`::`]);
			if (!type) return;
			syntax2 = true;
		}
		const instance = new this(context);
		instance.cast(parseCallback(instance, operand.trim()), type.trim(), syntax2);
		return instance;
	}
}
