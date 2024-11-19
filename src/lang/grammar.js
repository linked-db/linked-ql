// Statements
import { AlterDatabase } from './ddl/AlterDatabase.js';
import { CreateDatabase } from './ddl/CreateDatabase.js';
import { DropDatabase } from './ddl/DropDatabase.js';
import { RenameDatabase } from './ddl/RenameDatabase.js';
import { AlterTable } from './ddl/database/actions/AlterTable.js';
import { CreateTable } from './ddl/database/actions/CreateTable.js';
import { DropTable } from './ddl/database/actions/DropTable.js';
import { RenameTable } from './ddl/database/actions/RenameTable.js';
import { SelectStatement } from './dql/SelectStatement.js';
import { InsertStatement } from './dml/InsertStatement.js';
import { UpsertStatement } from './dml/UpsertStatement.js';
import { UpdateStatement } from './dml/UpdateStatement.js';
import { DeleteStatement } from './dml/DeleteStatement.js';

// Expressions
import { Exprs } from './expr/grammar.js';

/**
 * @var object
 */
export default [
	// Statements
	AlterDatabase,
	CreateDatabase,
	DropDatabase,
	RenameDatabase,
	AlterTable,
	CreateTable,
	DropTable,
	RenameTable,
	SelectStatement,
	InsertStatement,
	UpsertStatement,
	UpdateStatement,
	DeleteStatement,
	// Expressions
	...Exprs,
]