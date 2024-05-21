

import { _after } from '@webqit/util/str/index.js';
import { _avg, _unique, _max, _min, _sum, _first, _last, _rand } from '@webqit/util/arr/index.js';
import AggrFunction from '../parser/select/Aggr.js';
import DataRow2D from './DataRow2D.js';

export default class Aggregation extends Array {

	/**
	 * @inheritdoc
	 */
	push(...entries) {
		for (const entry of entries) {
			if (!(entry instanceof DataRow2D)) throw new Error(`Entries must be of type DataRow2D.`);
			super.push(dataRow2D);
		}
		return this;
	}

	/**
	 * Evaluates an expression against the data row.
	 * 
	 * @param Node expr
	 * 
	 * @returns Any
	 */
	eval(expr) {
		if (expr instanceof AggrFunction) {
		}
	}
	
	/**
	 * Evaluates an aggregate function expression against the data aggregation.
	 * 
	 * @param Node expr
	 * 
	 * @returns Any
	 */
	evalAggrFunction(expr) {
		if (expr instanceof Abstraction) {
		}
	}

	/**
	 * @inheritdoc
	 */
	_COUNT(flag, column) {
		if (column.stringify() === '*') { return this.length; } // NULLs accepted
		return this._COLUMN(flag, column).length;
	}
	
	/**
	 * @inheritdoc
	 */
	_GROUP_CONCAT(flag, column) { return this._COLUMN(flag, column).join(''); }
	
	/**
	 * @inheritdoc
	 */
	_GROUP_CONCAT_WS(flag, separator, column) { return this._COLUMN(flag, column).join(separator); }
	
	/**
	 * @inheritdoc
	 */
	_AVG(flag, column) { return _avg(this._COLUMN(flag, column)); }
	
	/**
	 * @inheritdoc
	 */
	_MAX(flag, column) { return _max(this._COLUMN(flag, column)); }
	
	/**
	 * @inheritdoc
	 */
	_MIN(flag, column) { return _min(this._COLUMN(flag, column)); }
	
	/**
	 * @inheritdoc
	 */
	_SUM(flag, column) { return _sum(this._COLUMN(flag, column)); }
	
	/**
	 * @inheritdoc
	 */
	_FIRST(flag, column) { return _first(this)?.eval(column); } // NULLs accepted
	
	/**
	 * @inheritdoc
	 */
	_LAST(flag, column) { return _last(this)?.eval(column); } // NULLs accepted
	
	/**
	 * @inheritdoc
	 */
	_ANY_VALUE(flag, column) { return _rand(this._COLUMN(flag, column)); }
	
	/**
	 * @inheritdoc
	 */
	_GROUPING(flag, ...onColumns) {
		if (!this.AGGR || !this.AGGR.isRollup) { return 0; }
		return onColumns.reduce((cum, column, i) => {
			const match = this.AGGR.by.filter(by => {
				let byStr = by.stringify();
				const columnStr = column.stringify();
				if (columnStr.indexOf('.') === -1 && byStr.indexOf('.') > -1) {
					byStr = _after(byStr, '.');
				}
				return columnStr === byStr;
			});
			return match.length ? i + 1 : cum;
		}, 0);
	}
	
	/**
	 * @inheritdoc
	 */
	_COLUMN(flag, arg) {
		let result = this.map(row => row.eval(arg));
		// COALESCE?
		if (Array.isArray(result[0])) {
			let width = result[0].length;
			result = result.filter(values => {
				if (!Array.isArray(values) || values.length !== width) {
					throw new Error('Aggregate column list not even!');
				}
				return values.reduce((_v, v) => !(_v === null) ? _v : v, null);
			});
		}
		// NO NULLS!
		result = result.filter(v => !(v === null));
		// DISTINCT?
		if (flag.toUpperCase() === 'DISTINCT') {
			result = _unique(result);
		}
		return result;
	}
	
	/**
	 * @inheritdoc
	 */
	_COLUMNS(flag, args) { return args.map(arg => this._COLUMN(flag, arg)); }
}