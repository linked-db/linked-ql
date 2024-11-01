import { AbstractLevel1Constraint } from './abstracts/AbstractLevel1Constraint.js';
import { AbstractExprConstraint } from './abstracts/AbstractExprMixin.js';

export class DefaultConstraint extends AbstractExprConstraint(AbstractLevel1Constraint) {}