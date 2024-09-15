import Identifier from '../../components/Identifier.js';
import AbstractStatement from '../AbstractStatement.js';
import DatabaseSchema from '../../schema/db/DatabaseSchema.js';
import TableSchema from '../../schema/tbl/TableSchema.js';
import Add from './Add.js';

export default class CreateStatement extends AbstractStatement(Add) {
    
    /**
	 * Instance props.
	 */
	ident() { return this.ARGUMENT && Identifier.fromJSON(this, [this.ARGUMENT.prefix?.(), this.ARGUMENT.name()]); }
	
	stringify() {
		const stmts = [super.stringify()];
		// Handle subtree
		if (['SCHEMA', 'DATABASE'].includes(this.KIND)) {
			stmts.push(...this.argument().TABLES.map(tblSchema => {
				return this.constructor.fromJSON(this, { kind: 'TABLE', argument: tblSchema.toJSON() });
			}));
		}
		return stmts.join(';\n');
	}

	static get CLAUSE() { return 'CREATE'; }
    static NODE_TYPES = [TableSchema, DatabaseSchema];
    static KINDS = ['TABLE', 'SCHEMA', 'DATABASE'];
}