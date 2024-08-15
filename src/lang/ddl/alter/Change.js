
import Lexer from '../../Lexer.js';
import Modify from './Modify.js';

export default class Change extends Modify {
	
	/**
	 * Instance props.
	 */
	NAME;

	/**
	 * @inheritdoc
	 */
	name(value = undefined) {
		if (!arguments.length) return this.NAME;
		return (this.NAME = value, this);
	}

	/**
	 * @inheritdoc
	 */
	toJSON() { return { name: this.NAME, ...super.toJSON(), }; }

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if (typeof json?.name !== 'string') return;
		return super.fromJSON(context, json)?.name(json.name);
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
		const stmts = [`${ this.CLAUSE } ${ this.KIND } ${ this.autoEsc(this.NAME) } ${ this.ARGUMENT }`];
        if (this.hasFlag('AFTER')) stmts.push(this.getFlag('AFTER')?.replace(':', ' '));
        else if (this.hasFlag('FIRST')) stmts.push('FIRST');
		return stmts.join(' ');
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
        const [ match, kind, name_unescaped, /*esc*/, name_escaped, argumentExpr ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s).join('|') })\\s+(?:(\\w+)|([\`"])((?:\\3\\3|[^\\3])+)\\3)?\\s+([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		instance.name(name_unescaped || this.autoUnesc(instance, name_escaped));
        const { tokens: [ $argumentExpr, afterRef ], matches } = Lexer.lex(argumentExpr, ['FIRST','AFTER'], { useRegex: 'i' });
        instance.argument(parseCallback(instance, $argumentExpr, this.NODE_TYPES));
        if (afterRef) instance.withFlag(`AFTER:${ afterRef }`);
        else if (matches.length) instance.withFlag('FIRST');
		return instance;
	}

	static get CLAUSE() { return 'CHANGE'; }
}