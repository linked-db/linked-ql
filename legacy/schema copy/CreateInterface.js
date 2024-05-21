
/**
 * @imports
 */
import ExprInterface from '../../ExprInterface.js';

/**
 * ---------------------------
 * CreateStatement
 * ---------------------------
 */				

const Interface = class extends ExprInterface {};
Object.defineProperty(Interface.prototype, 'jsenType', {
	get() { return 'CreateStatement'; },
});
export default Interface;
