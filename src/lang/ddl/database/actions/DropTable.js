import { AbstractDropAction } from '../../abstracts/AbstractDropAction.js';
import { AbstractDDLStatement } from '../../../AbstractDDLStatement.js';
import { GlobalTableRef } from '../../../expr/refs/GlobalTableRef.js';

export class DropTable extends AbstractDDLStatement(AbstractDropAction) {
    static get EXPECTED_KINDS() {
		return {
			TABLE: true,
			VIEW: true,
		};
	}

    static get REF_TYPES() {
        return {
			TABLE: [GlobalTableRef],
			VIEW: [GlobalTableRef],
        };
    }
}