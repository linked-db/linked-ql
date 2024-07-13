
import AbstractConstraint from './AbstractConstraint.js';
import Identity from './Identity.js';

export default class AutoIncrement extends AbstractConstraint {

	/**
	 * @var String
	 */
	static get TYPE() { return 'AUTO_INCREMENT'; }

    /**
     * @returns String
     */
    stringify() { return this.params.dialect !== 'mysql' ? (new Identity(this.CONTEXT)).stringify() : `AUTO_INCREMENT`; }
}