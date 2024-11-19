import { Lexer } from '../../Lexer.js';
import { Table } from './Table.js';
import { Identifier } from '../../expr/Identifier.js';
import { OnClause } from './OnClause.js';

export class JoinClause extends Table {
	static get REGEX() { return '(INNER\\s+|CROSS\\s+|(?:LEFT|RIGHT|FULL)(?:\\s+OUTER)?\\s+)?JOIN(?!\\w)'; }
	 
	#type;
	#usingClause;
	#onClause;

	type(value) {
		if (!arguments.length) return this.#type;
		return (this.#type = value, this);
	}

	expr(...args) {
		return args.length > 1 ? super.expr(args) : super.expr(...args);
	}

	on(...args) {
		if (!arguments.length) return this.#onClause;
		this.#onClause = this.$castInputs(args, OnClause, this.#onClause, 'on_clause', 'every');
		return this;
	}

	using(correlation) {
		if (!arguments.length) return this.#usingClause;
		this.#usingClause = this.$castInputs([correlation], Identifier, this.#usingClause, 'using_clause');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.type || Object.keys(json).filter((k) => !['nodeName', 'type', 'expr', 'alias', 'usingClause', 'onClause', 'claused'].includes(k)).length) return;
		return super.fromJSON(context, json, (instance) => {
			instance.type(json.type);
			if (json.usingClause) instance.using(json.usingClause);
			if (json.onClause) instance.on(json.onClause);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			type: this.#type,
			...(this.#usingClause ? { usingClause: this.#usingClause.jsonfy(options) } : {}),
			...(this.#onClause ? { onClause: this.#onClause.jsonfy(options) } : {}),
			...jsonIn
		});
	}
	
	static parse(context, expr, parseCallback) {
		const [ joinMatch, type, joinSpec ] = expr.match(new RegExp(`^${ this.REGEX }([\\s\\S]*)$`, 'i')) || [];
		if (!joinMatch) return;
		const [ $table, $correlation ] = Lexer.split(joinSpec, ['\\s+(?:ON|USING)\\s+'], { useRegex:'i', preserveDelims: true }).map(s => s.trim());
		const instance = super.parse(context, $table, parseCallback);
		instance.type(type.trim().toUpperCase() + '_JOIN');
		if (/^USING/i.test($correlation)) {
			instance.using(parseCallback(instance, $correlation.replace(/^USING\s+/i, ''), [Identifier]));
		} else if (/^ON/i.test($correlation)) {
			instance.on(parseCallback(instance, $correlation, [OnClause]));
		}
		return instance;
	}
	
	stringify() {
		return [
			this.#type?.replace(/_/, ' ').toUpperCase() || 'JOIN',
			super.stringify(),
			...[ this.#usingClause ? `USING ${ this.#usingClause }` : `${ this.#onClause }` ], 
		].filter(s => s).join(' ');
	}
}
