import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { TableRef } from './TableRef.js';

export class TableAbstractionRef extends TableRef {

    /* API */

    selectSchema(filter = null, linkedDb = null) {
        if (this.qualifier()) {
            return super.selectSchema(filter, linkedDb);
        }

        let statementNode = this.statementNode;
        if (!statementNode) throw new ErrorRefUnknown(`[${this.parentNode || this}]: Ref not associated with a statement.`);
        const name = this.value();
        const cs = this._has('delim');
        const resultSchemas = [];

        do {
            const querySchemasSchemaInScope = statementNode.querySchemas();
            for (const [alias, tableRefOrConstructor] of querySchemasSchemaInScope) {
                if (name && !this.identifiesAs(alias, cs)) continue;
                const schema = tableRefOrConstructor.deriveSchema(linkedDb)/* TableSchema */;
                if (filter && !filter(schema)) continue;
                resultSchemas.push(schema);
            }
        } while (!resultSchemas.length && (statementNode = statementNode.parentNode?.statementNode));
        
        return resultSchemas;
    }
}