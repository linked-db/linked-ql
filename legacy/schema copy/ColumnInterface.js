
/**
 * @imports
 */
import ExprInterface from '../../ExprInterface.js';

/**
 * ---------------------------
 * ColumnExpression
 * ---------------------------
 */				

const Interface = class extends ExprInterface {};
Object.defineProperty(Interface.prototype, 'jsenType', {
	get() { return 'ColumnExpression'; },
});
export default Interface;
