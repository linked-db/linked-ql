import { AbstractStmt } from '../abstracts/AbstractStmt.js';

export class DDLStmt extends AbstractStmt {
    

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: ['CreateSchemaStmt', 'DropSchemaStmt', 'CreateTableStmt', 'DropTableStmt'] }; }
}
