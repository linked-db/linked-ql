// Statements
import CreateStatement from './ddl/create/CreateStatement.js';
import AlterStatement from './ddl/alter/AlterStatement.js';
import DropStatement from './ddl/drop/DropStatement.js';
import RenameStatement from './ddl/rename/RenameStatement.js';
import DeleteStatement from './dml/delete/DeleteStatement.js';
import InsertStatement from './dml/insert/InsertStatement.js';
import SelectStatement from './dml/select/SelectStatement.js';
import UpdateStatement from './dml/update/UpdateStatement.js';
// Expressions
import Expr from './components/Expr.js';

/**
 * @var object
 */
export default [
	// Statements
	CreateStatement,
	AlterStatement,
	DropStatement,
	RenameStatement,
	InsertStatement,
	UpdateStatement,
	DeleteStatement,
	SelectStatement,
	// Expressions
	...
	Expr.Types,
]