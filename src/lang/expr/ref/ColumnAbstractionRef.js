import { registry } from '../../registry.js';
import { ColumnRef } from './ColumnRef.js';

export class ColumnAbstractionRef extends ColumnRef {

    /* API */

    selectSchema(filter = null, linkedDb = null) {
        let statementNode = this.statementNode;

        if (!statementNode) {
            return super.selectSchema(filter, linkedDb);
        }

        const name = this.value();
        const cs = this._has('delim');
        const resultSchemas = [];

        const selectElements = statementNode.selectList();
        for (const selectElement of selectElements) {

            const outputName = selectElement.alias() || selectElement.expr();
            
            if (name && !this.identifiesAs(outputName, cs)) continue;
            const schema = selectElement.expr().deriveSchema?.(linkedDb);
            if (!schema || filter && !filter(schema)) continue;

            const clonedRenamed = schema.clone({ renameTo: registry.ColumnIdent.fromJSON({ value: outputName.value() }) });

            resultSchemas.push(clonedRenamed);
        }

        if (!resultSchemas.length) {
            return super.selectSchema(filter, linkedDb);
        }

        return resultSchemas;
    }

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null, linkedDb = null) {
        if ((options.deSugar || options.fullyQualified) && this.value() && this.statementNode) {
            options = { deSugar: false, fullyQualified: false };
        }
        return super.jsonfy(options, transformCallback, linkedDb);
    }
}