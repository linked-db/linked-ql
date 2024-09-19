import Lexer from '../../Lexer.js';
import { _wrapped } from '@webqit/util/str/index.js';
import AbstractNode from '../../AbstractNode.js';
import Identifier from '../../components/Identifier.js';
import ColumnsList from './ColumnsList.js';
import ValuesList from './ValuesList.js';
import Expr from '../../components/Expr.js';

export default class AssignmentList extends AbstractNode {

    /**
	 * Instance properties
	 */
    ENTRIES = [];

    get length() { return this.ENTRIES.length; }
	
    set(target_s, value_s) {
		if (Array.isArray(target_s)) {
			target_s = ColumnsList.fromJSON(this, target_s);
			if (Array.isArray(value_s)) value_s = ValuesList.fromJSON(this, value_s);
			else value_s = Expr.cast(this, value_s);
		} else {
			target_s = target_s instanceof AbstractNode ? target_s : Identifier.fromJSON(this, target_s);
			value_s = value_s instanceof AbstractNode ? value_s : Expr.cast(this, value_s);
		}
		this.ENTRIES.push([target_s, value_s]);
		return this;
	}

	entries(...entries) {
		if (!arguments.length) return this.ENTRIES;
		for (const [target_s, value_s] of entries) this.set(target_s, value_s);
		return this;
	}

	getEntry(ref) {
		if (typeof ref === 'number') return this.ENTRIES[ref];
		return this.ENTRIES.find(([target_s]) => target_s instanceof Identifier && target_s.name().toLowerCase() === ref.toLowerCase());
	}

	removeEntry(ref) {
		const entry = this.getEntry(ref);
		if (entry) this.ENTRIES = this.ENTRIES.filter($entry => $entry !== entry);
		if (entry) entry.forEach(e => e.$trace?.('event:DISCONNECTED', e));
		return entry;
	}

	filterInplace(callback) {
		return this.ENTRIES = this.ENTRIES.filter((entry, i) => {
			const shouldRetain = callback(entry[0], entry[1], i);
			if (!shouldRetain) entry.forEach(e => e.$trace?.('event:DISCONNECTED', e));
			return shouldRetain;
		});
	}

	toJSON() { return { entries: this.ENTRIES.map(([target_s, value_s]) => [target_s.toJSON(), value_s.toJSON()]), }; }

	static fromJSON(context, json) {
		if (!Array.isArray(json?.entries)) return;
		const instance = new this(context);
		for (let [target_s, value_s] of json.entries) {
			instance.set(target_s, value_s);
		}
		return instance;
	}
	
	stringify() { return `\n\t${ this.ENTRIES.map(([target_s, value_s]) => `${ target_s } = ${ value_s }`).join(',\n\t') }`; }
	
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