import { ErrorRefAmbiguous } from './abstracts/ErrorRefAmbiguous.js';
import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { Identifier } from './Identifier.js';
import { registry } from '../../registry.js';

export class ColumnNameRef extends Identifier {

    /* SYNTAX RULES */

    static get syntaxPriority() { return -1; }

    /* SCHEMA API */

    selectSchema(filter = null, linkedDb = null) {
        const name = this.value();

        const tableSchemaInScope = this.climbTree((parentNode, up) => {
            if (typeof parentNode.deriveSchema === 'function') {
                return parentNode.deriveSchema(linkedDb)/* TableSchema */;
            }
            return up();
        });

        const resultSchemas = [];

        for (const childSchema of tableSchemaInScope) {
            if (!(childSchema instanceof registry.ColumnSchema)) continue;
            if (name && !childSchema.identifiesAs(this)) continue;
            if (filter && !filter(childSchema)) continue;
            resultSchemas.push(childSchema);
        }

        return resultSchemas;
    }

    deriveSchema(linkedDb) {
        const potentialSchemas = this.selectSchema(null, linkedDb);

        if (potentialSchemas.length > 1) {
            const refs = potentialSchemas.map((s) => s.name().clone({ fullyQualified: true }, null, linkedDb));
            throw new ErrorRefAmbiguous(`[${this.parentNode || this}] Column ${this} is ambiguous. (Is it ${refs.join(' or ')}?)`);
        } else if (!potentialSchemas.length) {
            throw new ErrorRefUnknown(`[${this.parentNode || this}] Column ${this} is unknown.`);
        }

        return potentialSchemas[0];
    }
}