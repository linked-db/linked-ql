import { AbstractRenameAction } from '../../abstracts/AbstractRenameAction.js';
import { GlobalDatabaseRef } from '../../../expr/refs/GlobalDatabaseRef.js';
import { GlobalTableRef } from '../../../expr/refs/GlobalTableRef.js';

export class Rename extends AbstractRenameAction {
    static get REF_TYPES() {
        return {
 			TABLE: [GlobalTableRef],
			VIEW: [GlobalTableRef],
        };
    }

	static get OWN_REF_TYPE() {
        return GlobalDatabaseRef;
    }
}