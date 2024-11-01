import { AbstractRenameAction } from './abstracts/AbstractRenameAction.js';
import { AbstractDDLStatement } from '../AbstractDDLStatement.js';
import { GlobalDatabaseRef } from '../expr/refs/GlobalDatabaseRef.js';

export class RenameDatabase extends AbstractDDLStatement(AbstractRenameAction) {
    static get REF_TYPES() {
        return {
            DATABASE: [GlobalDatabaseRef],
            SCHEMA: [GlobalDatabaseRef],
        };
    }
}