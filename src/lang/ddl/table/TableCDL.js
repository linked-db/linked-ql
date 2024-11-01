import { AbstractCDL } from '../abstracts/AbstractCDL.js';
import { Add } from './actions/Add.js';
import { Modify } from './actions/Modify.js';
import { Change } from './actions/Change.js';
import { Drop } from './actions/Drop.js';
import { Set } from './actions/Set.js';
import { Alter } from './actions/Alter.js';
import { Rename } from './actions/Rename.js';

export class TableCDL extends AbstractCDL {
    static get EXPECTED_TYPES() {
        return [Add, Modify, Change, Drop, Set, Alter, Rename];
    }
}