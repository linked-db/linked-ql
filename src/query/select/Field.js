
import AbstractAliasableExpr from './abstracts/AbstractAliasableExpr.js';
import CaseConstruct from './case/CaseConstruct.js';
import JsonPath from './json/JsonPath.js';
import Path from './Path.js';
import Func from './Func.js';
import Aggr from './Aggr.js';

export default class Field extends AbstractAliasableExpr {

	/**
	 * Plots a path
	 * 
	 * @param Array args
	 * 
	 * @returns this
	 */
	path(lhs, operator, rhs) { return (this.build('$EXPR', [lhs, operator, rhs], JsonPath.OPERATORS.includes(operator) ? JsonPath : Path, 'path'), this); }

	/**
	 * Function call
	 * 
	 * @param String name
	 * @param Array args
	 * 
	 * @returns this
	 */
	call(name, ...args) { return (this.build('$EXPR', [name, ...args], Aggr.names.flat().includes(name.toUpperCase()) ? Aggr : Func, 'call'), this); }

	/**
	 * Case construct
	 * 
	 * @param Array fns
	 * 
	 * @returns this
	 */
	case(...fns) { return (this.build('$EXPR', fns, CaseConstruct), this); }

}