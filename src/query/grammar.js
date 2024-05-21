
// Statements
import CreateTable from './create/CreateTable.js';
import CreateDatabase from './create/CreateDatabase.js';
import AlterTable from './alter/AlterTable.js';
import AlterDatabase from './alter/AlterDatabase.js';
import DropTable from './drop/DropTable.js';
import DropDatabase from './drop/DropDatabase.js';
import Delete from './delete/Delete.js';
import Insert from './insert/Insert.js';
import Select from './select/Select.js';
//import Union from './select/Union.js';
import Update from './update/Update.js';
// Expressions
import Expr from './select/abstracts/Expr.js';

/**
 * @var object
 */
export default [
	// Statements
	CreateDatabase,
	AlterDatabase,
	DropDatabase,
	CreateTable,
	AlterTable,
	DropTable,
	Insert,
	Update,
	Delete,
	//Union,
	Select,
	// Expressions
	...
	Expr.Types,
]