
/**
 * @imports
 */
import _isUndefined from '@webqit/util/js/isUndefined.js';
import _wrapped from '@webqit/util/str/wrapped.js';
import _unwrap from '@webqit/util/str/unwrap.js';
import Lexer from '@webqit/util/str/Lexer.js';
import ReferenceInterface from './ReferenceInterface.js';
import ExprInterface from '../ExprInterface.js';
import Scope from '../Scope.js';
import SyntaxError from '../SyntaxError.js';

/**
 * ---------------------------
 * Reference class
 * ---------------------------
 */				

export default class Reference extends ReferenceInterface {

	/**
	 * @inheritdoc
	 */
	constructor(context, name, backticks = false) {
		super();
		this.context = context;
		this.name = name;
		this.backticks = backticks;
	}
	 
	/**
	 * @inheritdoc
	 */
	toString() {
		return this.stringify();
	}
				
	/**
	 * @inheritdoc
	 */
	stringify(params = {}) {
		if (this.interpreted && params.interpreted) {
			if (_isArray(this.interpreted)) {
				return this.interpreted.map(ref => ref.stringify(params)).join(', ');
			}
			return this.interpreted.stringify(params);
		}
		// -----------
		return this._stringify(params);
	}
	
	/**
	 * @inheritdoc
	 */
	_stringify(params = {}) {
		var name = this.name;
		if (this.context) {
			var subjectContext = this.context.stringify(params);
			if (name instanceof ExprInterface) {
				name = '[' + name.stringify(params) + ']';
			} else if (this.backticks) {
				name = '`' + name + '`';
			}
		} else {
			var subjectContext = params.context;
			if (this.backticks) {
				name = '`' + name + '`';
			}
		}
		return (subjectContext || '') + (subjectContext && !name.startsWith('[') ? Reference.separator : '') + name;
	}

	/**
	 * @inheritdoc
	 */
	getEval(tempRow, params = {}) {
		// ------------
		// For those calling getEval() directly
		if (this.interpreted) {
			if (_isArray(this.interpreted)) {
				return this.interpreted.reduce((map, ref) => {
					map[ref.name] = ref.getEval(tempRow, params);
					return map;
				}, {});
			}
			return this.interpreted.getEval(tempRow, params);
		}
		// -----------
		// Lets find the table that contains the column
		var sourceContext = tempRow, name = this.name;
		if (this.context) {
			sourceContext = this.context.eval(tempRow, params);
		} else if (!(this.role === 'CONTEXT' || this.role === 'CALL_SPECIFIER')) {
			if (!tempRow.$) {
				throw new Error('"' + this + '" is undefined!');
			}
			sourceContext = tempRow.$;
		}
		return {
			get() {
				return Scope.create(sourceContext, params).get(name, params.trap);
			},
			del() {
				return Scope.create(sourceContext, params).del(name, params.trap);
			},
			has(prop) {
				return Scope.create(sourceContext, params).has(name, prop, params.trap);
			},
			set(val, initKeyword = null) {
				return Scope.create(sourceContext, params).set(name, val, params.trap, initKeyword);
			},
			exec(args) {
				return Scope.create(sourceContext, params).exec(name.toUpperCase(), args, params.trap);
			},
		};
	}
	
	/**
	 * @inheritdoc
	 */
	eval(tempRow, params = {}) {
		if (this.interpreted) {
			if (_isArray(this.interpreted)) {
				return this.interpreted.map(ref => ref.eval(tempRow, params))
			}
			return this.interpreted.eval(tempRow, params);
		}
		return this.getEval(tempRow, params).get();
	}

	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		if (!Lexer.match(expr.trim(), [' ']).length) {
			var splits = Lexer.split(expr, []);
			// ------------------------
			// name, first
			// ------------------------
			var context, name = splits.pop(), backticks;
			var nameSplit = Lexer.split(name.trim(), [this.separator], {preserveDelims:true});
			if (nameSplit.length > 1) {
				name = nameSplit.pop().substr(1);
				splits = splits.concat(nameSplit);
			}
			if (_wrapped(name, '`', '`')) {
				name = _unwrap(name, '`', '`');
				backticks = true;
			}
			// ------------------------
			// context, second
			// ------------------------
			if (splits.length) {
				context = await parseCallback(splits.join(''), null, {role: 'CONTEXT'});
			}
			if (_wrapped(name, '[', ']')) {
				if (!context) {
					throw new SyntaxError(expr);
				}
				name = await parseCallback(_unwrap(name, '[', ']'));
			}
			return new this(context, name, backticks);
		}
	}
};

/**
 * @prop string
 */
Reference.separator = '.';
