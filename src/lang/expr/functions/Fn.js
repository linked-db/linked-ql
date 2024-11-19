import { Lexer } from '../../Lexer.js';
import { AbstractNode } from '../../AbstractNode.js';
import { Exprs } from '../grammar.js';

export class Fn extends AbstractNode {

	#name;
	#args = [];

	name(value) {
		if (!arguments.length) return this.#name;
		if (typeof value !== 'string') throw new TypeError(`Invalid argument as function name.`);
		return (this.#name = value, this);
	}
	
	args(...args) {
		if (!arguments.length) return this.#args;
		this.#args = this.$castInputs(args, Exprs, this.#args, 'function_args');
		return this;
	}

	identifiesAs(value) { return value === this.#name || super.identifiesAs(value); }

	static get expose() {
		return {
			now: (context, ...args) => this.fromJSON(context, { name: 'NOW', args }),
			concat: (context, ...args) => this.fromJSON(context, { name: 'CONCAT', args }),
			count: (context, ...args) => this.fromJSON(context, { name: 'COUNT', args }),
			fn: (context, name, ...args) => this.fromJSON(context, { name, args }),
		};
	}

	static fromJSON(context, json, callback = null) {
		if (typeof json?.name !== 'string' || !Array.isArray(json.args)) return;
		return super.fromJSON(context, json, (instance) => {
			instance.name(json.name);
			for (const arg of json.args) instance.args(arg);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			name: this.#name,
			args: this.#args.map(o => o.jsonfy(options)),
			...jsonIn,
		});
	}

	static parse(context, expr, parseCallback) {
		const [ , name, args = '' ] = /^(\w+)(?:\s+)?\(([\s\S]+)?\)$/i.exec(expr) || [];
		if (!name || Lexer.match(expr.replace(name, '').trim(), [' ']).length) return;
		const instance = (new this(context)).name(name);
		const $args = Lexer.split(args, [',']).map(arg => parseCallback(instance, arg.trim()));
		for (const arg of $args) instance.args(arg);
		return instance;
	}
	
	stringify() { return `${ this.#name.toUpperCase() }(${ this.#args.join(', ') })`; }
}