
import AbstractAliasableExpr from './AbstractAliasableExpr.js';
import Identifier from './Identifier.js';
import Parens from './Parens.js';

export default class Table extends AbstractAliasableExpr {

	/**
	 * @property Array
	 */
	static get exprTypes() { return [Parens,Identifier]; }
}