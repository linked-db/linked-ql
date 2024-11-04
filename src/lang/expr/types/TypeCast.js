import { Lexer } from '../../Lexer.js';
import { AbstractNode } from '../../AbstractNode.js';
import { Exprs } from '../grammar.js';

export class TypeCast extends AbstractNode {
	
	#value;
	#type;
	#compact = false;
	
	value(value) {
		if (!arguments.length) return this.#value;
		this.#value = this.$castInputs([value], Exprs, this.#value, 'type_cast');
		return this;
	}
	
	type(value) {
		if (!arguments.length) return this.#type;
		return (this.#type = value, this);
	}
	
	compact(value = this.#compact) {
		if (!arguments.length) return this.#compact;
		return (this.#compact = value, this);
	}

	static get expose() {
		return { cast: (context, value, type, compact) => this.fromJSON(context, { value, type, compact }), };
	}

	static fromJSON(context, json, callback = null) {
		if (!json?.value || !json.type || Object.keys(json).filter((k) => !['nodeName', 'type', 'compact'].includes(k)).length > 1) return;
		return super.fromJSON(context, json, (instance) => {
			instance.value(json.value).type(json.type).compact(json.compact);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			value: this.#value?.jsonfy(options),
			type: this.#type,
			compact: this.#compact,
			...jsonIn
		});
    }
	 
	static parse(context, expr, parseCallback) {
		let value, type, compact = false;
		if (/^CAST(?:\s+)?\([\s\S]+\)$/i.test(expr)) {
			const [ , parens ] = Lexer.split(expr, []);
			[value, type] = Lexer.split(parens.slice(1, -1), [`AS`], { useRegex: 'i' });
		} else {
			if ((context?.params?.inputDialect || context?.params?.dialect) === 'mysql') return;
			[value, type] = Lexer.split(expr, [`::`]);
			if (!type) return;
			compact = true;
		}
		const instance = (new this(context)).type(type.trim()).compact(compact);
		return instance.value(parseCallback(instance, value.trim()));
	}
	
	stringify() {
		if (this.#compact && this.params.dialect !== 'mysql') return `${ this.#value }::${ this.#type }`;
		return `CAST(${ this.#value } AS ${ this.#type })`;
	}
}
