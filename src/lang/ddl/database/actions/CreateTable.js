import { AbstractCreateAction } from '../../abstracts/AbstractCreateAction.js';
import { AbstractDDLStatement } from '../../../AbstractDDLStatement.js';
import { TableSchema } from '../../table/TableSchema.js';

export class CreateTable extends AbstractDDLStatement(AbstractCreateAction) {
	static get EXPECTED_TYPES() {
		return {
			TABLE: [TableSchema],
			VIEW: [TableSchema],
		};
	}
}