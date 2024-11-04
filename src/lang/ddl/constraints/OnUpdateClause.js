import { AbstractLevel1Constraint } from './abstracts/AbstractLevel1Constraint.js';
import { AbstractExprMixin } from './abstracts/AbstractExprMixin.js';

export class OnUpdateClause extends AbstractExprMixin(AbstractLevel1Constraint) {}