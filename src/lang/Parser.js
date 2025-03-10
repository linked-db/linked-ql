import grammar from './grammar.js';
import { AbstractNode } from './AbstractNode.js';

AbstractNode.prototype.parse = function (expr) {
	return Parser.parse(this, expr);
}

export class Parser {

	/**
	 * @property Object
	 */
	static grammar = grammar;

	static parse(context, expr, grammar, params = {}) {
		if (!expr?.length) return;
		if (!context.NODE_NAME) expr = expr.trim();
		const $grammar = grammar?.length ? grammar : this.grammar;
		for (const Node of $grammar) {
			const node = this.parseOne(context, expr, Node, params);
			if (!node) continue;
			if (params.inspect) console.log('.................', expr, '.................>', node.constructor.name);
			return node;
		}
		if (params.assert === false) return;
		throw new SyntaxError(expr);
	}
	 
	static parseOne(context, expr, Node, params = {}) {
		return Node.parse(context, expr, ($context, $expr, $grammar, $params = {}) => {
			return this.parse($context, $expr, $grammar, { ...params, ...$params });
		});
	}
}