
/**
 * @imports
 */
import ExprInterface from '../../ExprInterface.js';

/**
 * ---------------------------
 * ConstraintExpression
 * ---------------------------
 */				

const Interface = class extends ExprInterface {};
Object.defineProperty(Interface.prototype, 'jsenType', {
	get() { return 'ConstraintExpression'; },
});
export default Interface;
