import { Identifier } from './Identifier.js';

export class ColumnNameRef extends Identifier {

    /* SYNTAX RULES */

    static get syntaxPriority() { return -1; }

    /* API */

    selectSchema(filter = null) {
        const name = this.value();
        const tableSchemaInScope = this.capture('CONTEXT.TABLE_SCHEMA');
        const columnSchemas = name
            ? [].concat(tableSchemaInScope?.column(name) || [])
            : tableSchemaInScope.columns();
        return filter ? columnSchemas.filter(filter) : columnSchemas;
    }
}