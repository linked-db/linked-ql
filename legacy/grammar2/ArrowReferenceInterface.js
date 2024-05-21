
/**
 * @imports
 */
import Reference from './Reference.js';

/**
 * ---------------------------
 * AggrInterface
 * ---------------------------
 */				

const Interface = class extends Reference {};
Object.defineProperty(Interface.prototype, 'jsenType', {
	get() { return 'ArrowReferenceExpression'; },
});
export default Interface;
