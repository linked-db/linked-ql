
import Add from './Add.js';
import AbstractStatement from '../AbstractStatement.js';
import DatabaseSchema from '../../schema/db/DatabaseSchema.js';
import TableSchema from '../../schema/tbl/TableSchema.js';

export default class CreateStatement extends AbstractStatement(Add) {
    
    /**
	 * Instance props.
	 */
	get NAME() { return this.ARGUMENT?.NAME; }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const stmts = [super.stringify()];
		// Handle subtree
		if (['SCHEMA', 'DATABASE'].includes(this.KIND)) {
			stmts.push(...this.argument().TABLES.map(tblSchema => {
				return this.constructor.fromJSON(this, { kind: 'TABLE', argument: tblSchema });
			}));
		}
		return stmts.join(';\n');
	}

	static get CLAUSE() { return 'CREATE'; }
    static NODE_TYPES = [TableSchema, DatabaseSchema];
    static KINDS = ['TABLE', 'SCHEMA', 'DATABASE'];
}