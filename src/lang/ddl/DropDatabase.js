import { AbstractDropAction } from './abstracts/AbstractDropAction.js';
import { AbstractDDLStatement } from '../AbstractDDLStatement.js';
import { GlobalDatabaseRef } from '../expr/refs/GlobalDatabaseRef.js';

export class DropDatabase extends AbstractDDLStatement(AbstractDropAction) {	
    static get EXPECTED_KINDS() {
		return {
			DATABASE: true,
			SCHEMA: true,
		};
	}

    static get REF_TYPES() {
        return {
            DATABASE: [GlobalDatabaseRef],
            SCHEMA: [GlobalDatabaseRef],
        };
    }
}