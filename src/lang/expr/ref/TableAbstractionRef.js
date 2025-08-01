import { registry } from '../../registry.js';
import { TableRef } from './TableRef.js';

export class TableAbstractionRef extends TableRef {

    /* API */

    selectSchema(filter = null, linkedDb = null) {
        let statementNode = this.statementNode;

        if (!statementNode) {
            return super.selectSchema(filter, linkedDb);
        }

        const name = this.value();
        const cs = this._has('delim');
        const resultSchemas = [];

        do {
            const querySchemasSchemaInScope = statementNode.querySchemas();
            for (const [alias, tableRefOrConstructor] of querySchemasSchemaInScope) {
                
                if (name && !this.identifiesAs(alias, cs)) continue;
                const schema = tableRefOrConstructor.deriveSchema(linkedDb)/* TableSchema */;
                if (filter && !filter(schema)) continue;

                const clonedRenamed = schema.clone({ renameTo: registry.Identifier.fromJSON({ value: alias }) });

                resultSchemas.push(clonedRenamed);
            }
        } while (!resultSchemas.length && (statementNode = statementNode.parentNode?.statementNode));

        
        if (!resultSchemas.length) {
            return super.selectSchema(filter, linkedDb);
        }
        
        return resultSchemas;
    }

	/* DESUGARING API */

	jsonfy(options = {}, transformCallback = null, linkedDb = null) {
		if (this.value() && (options.deSugar || options.fullyQualified)) {
            options = { deSugar: false, fullyQualified: false };
		}
		return super.jsonfy(options, transformCallback, linkedDb);
	}
}