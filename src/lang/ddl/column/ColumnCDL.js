import { AbstractCDL } from '../abstracts/AbstractCDL.js';
import { Add } from './actions/Add.js';
import { Drop } from './actions/Drop.js';
import { Set } from './actions/Set.js';

export class ColumnCDL extends AbstractCDL {
    static get EXPECTED_TYPES() {
        return [Add, Drop, Set];
    }
}