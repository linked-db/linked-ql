
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';
import Expr from '../select/abstracts/Expr.js';
import Identifier from '../select/Identifier.js';
import Node from '../abstracts/Node.js';
import Lexer from '../Lexer.js';

export default class AssignmentList extends Node {

    /**
	 * Instance properties
	 */
    ENTRIES = [];
    
    /**
	 * Builds the statement's ENTRIES
	 * 
	 * .set(i => i.name('col1'), 3);
	 * 
	 * @return this
	 */
    set(target_s, value_s) {
		if (Array.isArray(target_s)) target_s = target_s.map(t => t instanceof Node ? t : Identifier.fromJson(this, t));
		else if (!(target_s instanceof Node)) target_s = Identifier.fromJson(this, target_s);
		if (Array.isArray(value_s)) value_s = value_s.map(v => v instanceof Node ? v : Expr.cast(this, v));
		else if (!(value_s instanceof Node)) value_s = Expr.cast(this, value_s);
		this.ENTRIES.push([target_s, value_s]);
		return this;
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			entries: this.ENTRIES.map(([target_s, value_s]) => {
				if (Array.isArray(target_s)) target_s = target_s.map(t => t.toJson());
				else target_s = target_s.toJson();
				if (Array.isArray(value_s)) value_s = value_s.map(v => v.toJson());
				else value_s = value_s.toJson();
				return [target_s, value_s];
			}),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.entries)) return;
		const instance = new this(context);
		for (let [target_s, value_s] of json.entries) {
			instance.set(target_s, value_s);
		};
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		return `\n\t${ this.ENTRIES.map(([target_s, value_s]) => {
			if (Array.isArray(target_s)) target_s = `(${ target_s.join(', ') })`;
			if (Array.isArray(value_s)) value_s = `(${ value_s.join(', ') })`;
			return `${ target_s } = ${ value_s }`;
		}).join(',\n\t') }`;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const instance = new this(context);
		for (const assignmentExpr of Lexer.split(expr, [','])) {
			const [target_s, value_s] = Lexer.split(assignmentExpr, ['=']).map(s => s.trim()).filter(s => s);
			if (!value_s) return; // Abort... for this isn't the kind of expression we handle here
			if (_wrapped(target_s, '(', ')')) {
				const targets = Lexer.split(_unwrap(target_s, '(', ')'), [',']).map(expr => parseCallback(instance, expr.trim(), [Identifier]));
				if (!_wrapped(value_s, '(', ')')) return; // Abort... for this isn't the kind of expression we handle here
				const values = /^\((\s+)?SELECT\s+/i.test(value_s) 
					? parseCallback(instance, value_s) 
					: Lexer.split(_unwrap(value_s, '(', ')'), [',']).map(expr => parseCallback(instance, expr.trim()));
				instance.set(targets, values);
			} else {
				const target = parseCallback(instance, target_s);
				const value = parseCallback(instance, value_s);
				instance.set(target, value);
			}
		}
		return instance;
	}
}