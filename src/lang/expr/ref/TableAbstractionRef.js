import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { TableRef } from './TableRef.js';

export class TableAbstractionRef extends TableRef {

    /* API */

    selectSchema(filter = null) {
        if (this.qualifier()) {
            return super.selectSchema(filter);
        }
        let statementNode = this.statementNode;
        if (!statementNode) throw new ErrorRefUnknown(`[${this.parentNode || this}]: Ref not associated with a statement.`);
        const name = this.value();
        const resultSchemas = [];
        do {
            const querySchemasSchemaInScope = statementNode.querySchemas();
            for (const [alias, tableRefOrConstructor] of querySchemasSchemaInScope) {
                if (name && !this.identifiesAs(alias)) continue;
                const schema = tableRefOrConstructor.tableSchema();
                if (filter && !filter(schema)) continue;
                resultSchemas.push(schema);
            }
        } while (!resultSchemas.length && (statementNode = statementNode.parentNode?.statementNode));
        return resultSchemas;
    }
}