import { AbstractLevel1Constraint } from './abstracts/AbstractLevel1Constraint.js';
import { IdentityConstraint } from './IdentityConstraint.js';

export class AutoIncrementConstraint extends AbstractLevel1Constraint {
	static get TYPE() { return 'AUTO_INCREMENT'; }

    stringify() {
        return this.params.dialect !== 'mysql' 
            ? (new IdentityConstraint(this.contextNode)).stringify() 
            : `AUTO_INCREMENT`;
    }
}