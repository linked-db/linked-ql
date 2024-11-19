import { AbstractAlterAction } from './abstracts/AbstractAlterAction.js';
import { AbstractDDLStatement } from '../AbstractDDLStatement.js';
import { GlobalDatabaseRef } from '../expr/refs/GlobalDatabaseRef.js';
import { DatabaseCDL } from './database/DatabaseCDL.js';

export class AlterDatabase extends AbstractDDLStatement(AbstractAlterAction) {
    static get EXPECTED_TYPES() {
        return {
			DATABASE: [DatabaseCDL],
			SCHEMA: [DatabaseCDL],
        };
    }

    static get REF_TYPES() {
        return {
			DATABASE: [GlobalDatabaseRef],
			SCHEMA: [GlobalDatabaseRef],
        };
    }

    stringify() {
		const [ownRename, renames, sets, actions] = this.argument().actions().reduce(([a, b, c, d], action) => {
			if (action.CLAUSE === 'RENAME' && !action.KIND) return [action, b, c, d];
			if (action.CLAUSE === 'RENAME') return [a, b.concat(action), c, d];
			if (action.CLAUSE === 'SET') return [a, b, c.concat(action), d];
			return [a, b, c, d.concat(action)];
		}, [null, [], [], []]);
		const sql = [];
        sql.push(...actions, ...renames); // These are independent statements on their own
		for (const set of sets) sql.push(`ALTER ${this.KIND} ${this.reference()} ${set}`);
		if (ownRename) sql.push(`ALTER ${this.KIND} ${this.reference()} ${ownRename}`);
		return sql.join(';\n');
	}
}