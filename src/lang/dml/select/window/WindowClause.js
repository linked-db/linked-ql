
import Lexer from '../../../Lexer.js';
import AbstractNode from '../../../AbstractNode.js';
import WindowSpec from './WindowSpec.js';

export default class WindowClause extends AbstractNode {
	
	/**
	 * Instance properties
	 */
	WINDOWS_LIST = [];

	/**
	 * Adds a window spec.
	 * 
	 * @param Array windows
	 * 
	 * @returns this
	 */
	define(...windows) { return this.build('WINDOWS_LIST', windows, WindowSpec); }

	toJSON() { return { window_list: this.WINDOWS_LIST.map(w => w.toJSON()) }; }

	static fromJSON(context, json) {
		if (!Array.isArray(json?.window_list)) return;
		const instance = new this(context);
		instance.define(...json.window_list);
		return instance;
	}

	
	stringify() { return `WINDOW ${ this.WINDOWS_LIST.join(',') }`; }
	
	static parse(context, expr, parseCallback) {
		const [ windowMatch, windowSpec ] = expr.match(new RegExp(`^${ this.regex }([\\s\\S]*)$`, 'i')) || [];
		if (!windowMatch) return;
		const instance = new this(context);
		for (const spec of Lexer.split(windowSpec, [','])) {
			instance.define(parseCallback(instance, spec.trim(), [Window]));
		}
		return instance;
	}

	/**
	 * @property String
	 */
	static regex = 'WINDOW';
}