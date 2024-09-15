import Identifier from '../../components/Identifier.js';
import Lexer from '../../Lexer.js';
import Modify from './Modify.js';

export default class Change extends Modify {

	/**
	 * Instance props.
	 */
	IDENT;

	ident(value) {
		if (!arguments.length) return this.IDENT;
		return (this.build('IDENT', [value], Identifier), this);
	}

	toJSON() { return { ident: this.IDENT.toJSON(), ...super.toJSON(), }; }

	static fromJSON(context, json) {
		if (!Identifier.fromJSON(context, json?.ident)) return;
		return super.fromJSON(context, json)?.ident(json.ident);
	}

	stringify() {
		const stmts = [`${ this.CLAUSE } ${ this.KIND } ${ this.IDENT } ${ this.ARGUMENT }`];
        if (this.hasFlag('AFTER')) stmts.push(this.getFlag('AFTER')?.replace(':', ' '));
        else if (this.hasFlag('FIRST')) stmts.push('FIRST');
		return stmts.join(' ');
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, kind, $expr ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s).join('|') })\\s+([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		const [ ident, $$expr ] = Lexer.split($expr, ['\\s+'], { useRegex: 'i', limit: 1 });
		instance.ident(parseCallback(instance, ident, [Identifier]));
		this.handleArgumentExpr(instance, $$expr, parseCallback);
		return instance;
	}

	static get CLAUSE() { return 'CHANGE'; }
}