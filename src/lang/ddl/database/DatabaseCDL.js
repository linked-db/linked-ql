import { AbstractCDL } from '../abstracts/AbstractCDL.js';
import { AlterTable } from './actions/AlterTable.js';
import { CreateTable } from './actions/CreateTable.js';
import { DropTable } from './actions/DropTable.js';
import { Rename } from './actions/Rename.js';
import { Set } from './actions/Set.js';

export class DatabaseCDL extends AbstractCDL {
    static get EXPECTED_TYPES() {
        return [AlterTable, CreateTable, DropTable, Rename, Set];
    }
}