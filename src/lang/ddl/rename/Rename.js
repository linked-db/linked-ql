import Lexer from '../../Lexer.js';
import Identifier from '../../components/Identifier.js';
import AbstractNode from '../AbstractNode.js';

export default class Rename extends AbstractNode {

	/**
	 * Instance props.
	 */
	IDENT;
	ARGUMENT;

	ident(value) {
		if (!arguments.length) return this.IDENT;
		return (this.build('IDENT', [value], Identifier), this);
	}

	argument(value) {
		if (!arguments.length) return this.ARGUMENT;
		return (this.build('ARGUMENT', [value], Identifier), this);
	}

	toJSON() {
        return {
            ...(this.IDENT ? { ident: this.IDENT.toJSON() } : {}),
            argument: this.ARGUMENT.toJSON(),
			...super.toJSON(),
        };
    }

	static fromJSON(context, json) {
		if ((json?.kind && !Identifier.fromJSON(context, json.ident)) || !Identifier.fromJSON(context, json.argument)) return;
        const instance = super.fromJSON(context, json);
		if (!instance) return;
		if (json.ident) instance.ident(json.ident);
		instance.argument(json.argument);
		return instance;
	}
	
	stringify() { return `${ this.CLAUSE }${ this.KIND ? ` ${ this.KIND }` : '' }${ this.IDENT ? ` ${ this.IDENT }` : '' } TO ${ this.ARGUMENT }`; }
	
	static parse(context, expr, parseCallback) {
		const [ match, kind = '', rename ] = (new RegExp(`^${ this.CLAUSE }\\s+(?:(${ this.KINDS.map(s => s).join('|') })\\s+)?([\\s\\S]+)`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.replace(/\s+/g, '_').toUpperCase());
		const [ name1, name2 ] = Lexer.split(rename, ['(TO|AS)'], { useRegex: true, limit: 1 });
		if (kind) instance.ident(parseCallback(instance, name1, [Identifier]));
		instance.argument(parseCallback(instance, name2, [Identifier]));
		return instance;
	}

	static get CLAUSE() { return 'RENAME'; }
    static KINDS = ['COLUMN', 'CONSTRAINT', 'INDEX', 'KEY'];
}