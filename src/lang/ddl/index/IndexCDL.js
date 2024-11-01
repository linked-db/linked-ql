import { AbstractCDL } from '../abstracts/AbstractCDL.js';
import { Flag } from './actions/Flag.js';

export class IndexCDL extends AbstractCDL {
    static get EXPECTED_TYPES() {
        return [Flag];
    }
}