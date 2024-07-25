
import { _from as _objFrom, _merge, _get } from '@webqit/util/obj/index.js';
import { _avg, _unique, _max, _min, _sum, _first, _last, _rand } from '@webqit/util/arr/index.js';
import Abstraction from '../parser/select/Abstraction.js';
import Assertion from '../parser/select/Condition.js';
import Condition from '../parser/select/Condition.js';
import Condition from '../parser/select/Condition.js';
import Field from '../parser/select/Field.js';
import Function from '../parser/select/Func.js';
import Math from '../parser/select/Math.js';
import Placeholder from '../parser/select/Placeholder.js';
import DataRow from './DataRow.js';

export default class DataRow2D {

	/**
	 * @constructor
	 */
	constructor(structure, meta = {}) {
		this._structure = structure;
		Object.defineProperty(this, '$$structure', {
			get: () => this._structure,
		});
		this._map = {};
		for (const key of structure) {
			Object.defineProperty(this, key, {
				set: value => {
					if (!(value instanceof DataRow)) throw new Error(`Value must be of type DataRow.`);
					this._map[key] = value;
				},
				get: () => this._map[key],
			});
		}
		this._computed = {};
		Object.defineProperty(this, '$$computed', {
			get: () => this._computed,
		});
		this._meta = meta;
		Object.defineProperty(this, '$$meta', {
			get: () => this._meta,
		});
	}

	/**
	 * Evaluates an expression against the data row.
	 * 
	 * @param Node expr
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async eval(expr, callback) {
		if (typeof expr === 'string') {
			if (/^NULL$/i.test(expr)) return null;
			if (/^TRUE$/i.test(expr)) return true;
			if (/^FALSE$/i.test(expr)) return false;
			if (/^[\d.]+$/.test(expr)) return parseFloat(expr);
			return expr;
		}
		if (expr instanceof Node && this[`eval${ expr.constructor.name }`]) {
			return await this[`eval${ expr.constructor.name }`](expr, callback);
		}
		return await callback(expr);
	}

	/**
	 * Evaluates a Field expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalRef(node, callback) {
		for (const basename of this._structure) {
			if (node.basename && node.basename !== basename) continue;
			if (node.name in (this[basename] || {})) {
				return this[basename][node.name];
			}
		}
		throw new ReferenceError(`"${ node.name }" is unknown.`);
	}

	/**
	 * Evaluates a Field expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalField(node, callback) {
		if (node.expr.name === '*') {
			const map = {};
			for (const basename of this._structure) {
				if (node.expr.basename && node.expr.basename !== basename) continue;
				for (const key in (this[basename] || {})) {
					if (key in map) continue;
					map[key] = this[basename][key];
				}
			}
			return map;
		}
		const value = await this.eval(node.expr, callback);
		const name = node.alias || node.expr.name;
		return { [name]: value };
	}

	/**
	 * Evaluates an Abstract expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalAbstraction(node, callback) { return await this.eval(node.expr, callback); }

	/**
	 * Evaluates an Condition expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalCondition(node, callback) { return await this.evalCondition(node, callback); }

	/**
	 * Evaluates an Correlation expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalCorrelation(node, callback) { return await this.evalCondition(node, callback); }

	/**
	 * Evaluates an Having expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalHaving(node, callback) { return await this.evalCondition(node, callback); }

	/**
	 * Evaluates an Condition expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalCondition(node, callback) {
		if (node.logic === 'OR') return node.assertions.reduce(async (prev, ass) => (await prev) || await this.eval(ass, callback), false);
		return node.assertions.reduce(async (prev, ass) => (await prev) && await this.eval(ass, callback), true);
	}

	/**
	 * Evaluates a Assertion expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Bool
	 */
	async evalAssertion(node, callback) {
		const operands = await Promise.all(node.operands.map(operand => this.eval(operand, callback)));
		switch(node.operator) {
			case '=':
			case 'IS NOT DISTINCT FROM':
				return operands[0] === operands[1];
			case '!=':
			case '<>':
			case 'IS DISTINCT FROM':
				return operands[0] !== operands[1];
			case '>':
				return operands[0] > operands[1];
			case '>=':
				return operands[0] >= operands[1];
			case '<':
				return operands[0] < operands[1];
			case '<=':
				return operands[0] <= operands[1];
			case 'IN':
			case 'ANY':
				return operands.slice(1).includes(operands[0]);
			case 'LIKE':
				return (operands[1] + '').includes(operands[0]);
			case 'IS NULL':
				return operands[0] === null;
			case 'IS NOT NULL':
				return operands[0] !== null;
			case 'IS TRUE':
				return operands[0] === true;
			case 'IS NOT TRUE':
				return operands[0] !== true;
			case 'IS FALSE':
				return operands[0] === false;
			case 'IS NOT FALSE':
				return operands[0] !== false;
			case 'IS UNKNOWN':
				return operands[0] === undefined;
			case 'IS NOT UNKNOWN':
				return operands[0] !== undefined;
			case 'IS BETWEEN':
			case 'IS BETWEEN SYMMETRIC':
				return operands[0] > operands[1] && operands[0] < operands[2];
			case 'IS NOT BETWEEN':
			case 'IS NOT BETWEEN SYMMETRIC':
				return !(operands[0] > operands[1] && operands[0] < operands[2]);
			default:
				throw new Error(`Operator not supported: ${ node.operator }.`);
		}
	}

	/**
	 * Evaluates a Case expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalCase(node, callback) {
		const assertion = await this.eval(node.assertion, callback);
		const onTrueExpr = await this.eval(node.onTrueExpr, callback);
		const onFalseExpr = await this.eval(node.onFalseExpr, callback);
		return assertion ? onTrueExpr : onFalseExpr;
	}

	/**
	 * Evaluates a Math expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	async evalMath(node, callback) {
		const operand1 = await this.eval(node.operand1, callback);
		const operand2 = await this.eval(node.operand2, callback);
		switch(node.operator) {
			case '+': return operand1 + operand2;
			case '-': return operand1 - operand2;
			case '*': return operand1 * operand2;
			case '/': return operand1 / operand2;
		}
	}

	/**
	 * Evaluates a Function expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	evalFunction(node) {
		try {
			var args = this.args.eval(context, callback);
			return this.reference.getEval(context, callback).exec(args);
		} catch(e) {
			if (e instanceof ReferenceError) {
				throw new ReferenceError('[' + this + ']: ' + e.message);
			} else {
				throw e;
			}
		}
	}

	/**
	 * Evaluates a Placeholder expression.
	 * 
	 * @param Node node
	 * @param Function callback
	 * 
	 * @returns Any
	 */
	evalPlaceholder(node) {
		if (typeof this.name === 'number') {
			if (!params.vars) {
				throw new Error('Annonymous placeholders require a "params.vars" array to be resolved.');
			}
			return params.vars[this.name];
		}
		if (!params.vars) {
			throw new Error('Named placeholders require a "params.vars" object to be resolved.');
		}
		return params.vars[this.name];
	}
	 
	/**
	 * @inheritdoc
	 */
	_CONCAT(...args) { return args.join(''); }
	 
	/**
	 * @inheritdoc
	 */
	_CONCAT_WS(...args) { return args.join(args.shift()); }
	 
	/**
	 * @inheritdoc
	 */
	_COALESCE(...args) { return args.reduce((prev, next) => !(prev === null) ? prev : next, null); }
		 
	/**
	 * @inheritdoc
	 */
	_FIND_IN_SET(substr, str) { return str.indexOf(substr); }
			 
	/**
	 * @inheritdoc
	 */
	_ISNULL(val) { return val === null; }
	
	/**
	 * ----------------
	 * JSON FUNCTIONS
	 * ----------------
	 */
	
	/**
	 * @inheritdoc
	 */
	_JSON_EXTRACT(doc, path) { return _get(JSON.parse(doc), path.split('.').slice(1)); }
	
	/**
	 * @inheritdoc
	 */
	_JSON_OBJECT(name, value) { return _objFrom(name, value); }
	
	/**
	 * @inheritdoc
	 */
	_JSON_MERGE(doc1, doc2) { return _merge(JSON.parse(doc1), JSON.parse(doc2)); }
}