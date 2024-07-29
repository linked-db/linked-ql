
import AbstractLevel1Constraint from './AbstractLevel1Constraint.js';
import IdentityConstraint from './IdentityConstraint.js';

export default class AutoIncrementConstraint extends AbstractLevel1Constraint {

	/**
	 * @var String
	 */
	static get TYPE() { return 'AUTO_INCREMENT'; }

    /**
     * @returns String
     */
    stringify() { return this.params.dialect !== 'mysql' ? (new IdentityConstraint(this.CONTEXT)).stringify() : `AUTO_INCREMENT`; }
}