import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class ColumnRef2 extends AbstractClassicRef {

    /* SYNTAX RULES */

    static get syntaxPriority() { return -1; }

    /* SCHEMA API */

    dataType() { return this.ddlSchema()?.dataType() || super.dataType(); }

    lookup(deepMatchCallback, linkedContext = null, linkedDb = null) {
        if (!linkedContext && !linkedDb) return [];

        const inGrepMode = !this._get('value');
        let resultSet = [];

        const resolve = (columnSchema) => {
            if (!(columnSchema instanceof registry.ColumnSchema)) return false;
            if (!(inGrepMode || columnSchema.identifiesAs(this))) return false;
            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(columnSchema))) return false;
            if (result instanceof AbstractNode) return result;
            return ColumnRef2.fromJSON({
                value: columnSchema.name().value(),
                result_schema: columnSchema.clone({ normalized: true })
            });
        };

        let tableSchemaInScope;
        if (this.parentNode instanceof AbstractMagicRef) {
            if (this === this.parentNode.operand()) {
                tableSchemaInScope = this.parentNode.parentNode.rhsSchema();
            } else {
                tableSchemaInScope = this.parentNode.rhsSchema();
            }
        } else {
            tableSchemaInScope = this.climbTree((superParentNode, up) => {
                const potentialSchema = superParentNode.ddlSchema?.(linkedContext, linkedDb);
                if (potentialSchema instanceof registry.TableSchema) {
                    return potentialSchema;
                }
                return up();
            });
        }

        for (const columnSchema of tableSchemaInScope || []) {
            let result;
            if (result = resolve(columnSchema)) {
                resultSet.push(result);
                if (!inGrepMode) break; // Matching current instance only
            }
        }

        return resultSet;
    }

    jsonfy(options = {}, linkedContext = null, linkedDb = null) {
        if (options.deSugar
            && this.value() !== '*'
            && !this.ddlSchema()
            && (linkedContext || linkedDb)) {
            return this.resolve(linkedContext, linkedDb).jsonfy(/* IMPORTANT */);
        }
        return super.jsonfy(options, linkedContext = null, linkedDb);
    }
}