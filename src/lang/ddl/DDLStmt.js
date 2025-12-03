import { AbstractStmt } from '../abstracts/AbstractStmt.js';

export class DDLStmt extends AbstractStmt {
    

    /* SYNTAX RULES */

    static get syntaxRules() { return { type: ['CreateSchemaStmt', 'DropSchemaStmt', 'CreateTableStmt', 'DropTableStmt'] }; }

    /** API */
    
    jsonfy({ deSugar, ...options } = {}, transformer = null, schemaInference = null) {
        if (this.returningClause?.()) {
            options = { deSugar, ...options };
        }
        return super.jsonfy(options, transformer, schemaInference);
    }
}
