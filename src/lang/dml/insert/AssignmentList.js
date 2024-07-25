
import Lexer from '../../Lexer.js';
import { _wrapped } from '@webqit/util/str/index.js';
import AbstractNode from '../../AbstractNode.js';
import Expr from '../../componets/Expr.js';
import Identifier from '../../componets/Identifier.js';
import ColumnsList from './ColumnsList.js';
import ValuesList from './ValuesList.js';

export default class AssignmentList extends AbstractNode {

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
		if (Array.isArray(target_s)) {
			target_s = ColumnsList.fromJson(this, target_s);
			if (Array.isArray(value_s)) value_s = ValuesList.fromJson(this, value_s);
			else value_s = Expr.cast(this, value_s);
		} else if (!(target_s instanceof AbstractNode)) {
			target_s = Identifier.fromJson(this, target_s);
			value_s = Expr.cast(this, value_s);
		}
		this.ENTRIES.push([target_s, value_s]);
		return this;
	}

	/**
	 * @inheritdoc
	 */
	toJson() { return { entries: this.ENTRIES.map(([target_s, value_s]) => [target_s.toJson(), value_s.toJson()]), }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.entries)) return;
		const instance = new this(context);
		for (let [target_s, value_s] of json.entries) {
			instance.set(target_s, value_s);
		}
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		return `\n\t${ this.ENTRIES.map(([target_s, value_s]) => `${ target_s } = ${ value_s }`).join(',\n\t') }`;
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
				const targets = parseCallback(instance, value_s.trim(), [ColumnsList]);;
				if (!_wrapped(value_s, '(', ')')) return; // Abort... for this isn't the kind of expression we handle here
				const values = /^\((\s+)?SELECT\s+/i.test(value_s) 
					? parseCallback(instance, value_s.trim()) 
					: parseCallback(instance, value_s.trim(), [ValuesList]);
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