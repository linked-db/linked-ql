import { AbstractAlterAction } from '../../abstracts/AbstractAlterAction.js';
import { AbstractDDLStatement } from '../../../AbstractDDLStatement.js';
import { GlobalTableRef } from '../../../expr/refs/GlobalTableRef.js';
import { TableCDL } from '../../table/TableCDL.js';

export class AlterTable extends AbstractDDLStatement(AbstractAlterAction) {
    static get EXPECTED_TYPES() {
        return {
			TABLE: [TableCDL],
			VIEW: [TableCDL],
        };
    }

    static get REF_TYPES() {
        return {
 			TABLE: [GlobalTableRef],
			VIEW: [GlobalTableRef],
        };
    }
    
    stringify() {
		const [moveAction, ownRename, renames, actions] = this.argument().actions().reduce(([a, b, c, d], action) => {
			if (action.CLAUSE === 'SET' && action.KIND === 'SCHEMA') return [action, b, c, d];
			if (action.CLAUSE === 'RENAME' && !action.KIND) return [a, action, c, d];
			if (action.CLAUSE === 'RENAME') return [a, b, c.concat(action), d];
			return [a, b, c, d.concat(action)];
		}, [null, null, [], []]);
		const sql = [], stmt_ = `ALTER ${this.KIND}${ this.hasFlag('IF_EXISTS') ? ` IF EXISTS` : ''}`;
		if (actions.length) sql.push(`${stmt_} ${this.reference()}\n\t${actions.join(',\n\t')}`);
		for (const rename of renames.concat(ownRename || [])) sql.push(`${stmt_} ${this.reference()} ${rename}`);
		if (moveAction) sql.push(`${stmt_} ${ownRename?.argument() || this.reference()} ${moveAction}`);
		return sql.join(';\n');
	}
}