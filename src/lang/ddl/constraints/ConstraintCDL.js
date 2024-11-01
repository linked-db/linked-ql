import { AbstractCDL } from '../abstracts/AbstractCDL.js';
import { Flag } from './actions/Flag.js';

export class ConstraintCDL extends AbstractCDL {
    static get EXPECTED_TYPES() {
        return [Flag];
    }
}