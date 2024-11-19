import { AbstractCDL } from './abstracts/AbstractCDL.js';
import { AlterDatabase } from './AlterDatabase.js';
import { CreateDatabase } from './CreateDatabase.js';
import { DropDatabase } from './DropDatabase.js';
import { RenameDatabase } from './RenameDatabase.js';

export class RootCDL extends AbstractCDL {
    static get EXPECTED_TYPES() {
        return [AlterDatabase, CreateDatabase, DropDatabase, RenameDatabase];
    }
}