
/**
 * @imports
 */
import IndependentExprInterface from '../IndependentExprInterface.js';

/**
 * ---------------------------
 * TableInterface
 * ---------------------------
 */				

const Interface = class extends IndependentExprInterface {};
Object.defineProperty(Interface.prototype, 'jsenType', {
	get() { return 'TableExpression'; },
});
export default Interface;
