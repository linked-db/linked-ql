import { TableRef } from './TableRef.js';

export class TableAbstractionRef extends TableRef {

    /* API */

    selectSchema(filter = null) {
        const name = this.value();
        const databaseSchemaInScope = this.capture('CONTEXT.QUERY_SCHEMA');
        const tableSchemas = name
            ? [].concat(databaseSchemaInScope?.table(name) || [])
            : databaseSchemaInScope.tables();
        return filter ? tableSchemas.filter(filter) : tableSchemas;
    }
}