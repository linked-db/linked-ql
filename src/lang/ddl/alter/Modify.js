import Lexer from '../../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import Column from '../../schema/tbl/Column.js';

export default class Modify extends AbstractNode {

	/**
	 * Instance props.
	 */
	ARGUMENT;

	argument(argument) {
		if (!arguments.length) return this.ARGUMENT;
		return (this.build('ARGUMENT', [argument], this.constructor.NODE_TYPES), this);
	}

	toJSON() { return { argument: this.ARGUMENT.toJSON(), ...super.toJSON(), }; }

	static fromJSON(context, json) {
		if (!json?.kind || !json.argument) return;
        return super.fromJSON(context, json)?.argument(json.argument);
	}
	
	stringify() {
		const stmts = [`${ this.CLAUSE } ${ this.KIND } ${ this.ARGUMENT }`];
        if (this.hasFlag('AFTER')) stmts.push(this.getFlag('AFTER')?.replace(':', ' '));
        else if (this.hasFlag('FIRST')) stmts.push('FIRST');
		return stmts.join(' ');
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, kind, $expr ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s).join('|') })\\s+([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		this.handleArgumentExpr(instance, $expr, parseCallback);
		return instance;
	}

	static handleArgumentExpr(instance, expr, parseCallback) {
		const { tokens: [ $expr, afterRef ], matches } = Lexer.lex(expr, ['FIRST','AFTER'], { useRegex: 'i' });
		instance.argument(parseCallback(instance, $expr, this.NODE_TYPES));
		if (afterRef) instance.withFlag(`AFTER:${ afterRef }`);
        else if (matches.length) instance.withFlag('FIRST');
	}

	static get CLAUSE() { return 'MODIFY'; }
	static NODE_TYPES = [Column];
    static KINDS = ['COLUMN'];
}