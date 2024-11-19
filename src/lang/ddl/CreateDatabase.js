import { AbstractCreateAction } from './abstracts/AbstractCreateAction.js';
import { AbstractDDLStatement } from '../AbstractDDLStatement.js';
import { DatabaseSchema } from './database/DatabaseSchema.js';
import { CreateTable } from './database/actions/CreateTable.js';

export class CreateDatabase extends AbstractDDLStatement(AbstractCreateAction) {
	static get EXPECTED_TYPES() {
		return {
			DATABASE: [DatabaseSchema],
			SCHEMA: [DatabaseSchema],
		};
	}

	stringify() {
		const sql = [super.stringify()];
		sql.push(...this.argument().tables().map(tblSchema => {
			const createTbl = CreateTable.fromJSON(this, { argument: tblSchema });
			if (this.hasFlag('IF_NOT_EXISTS')) createTbl.withFlag('IF_NOT_EXISTS');
			return createTbl;
		}));
		return sql.join(';\n');
	}
}