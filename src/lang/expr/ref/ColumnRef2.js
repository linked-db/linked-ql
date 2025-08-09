import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class ColumnRef2 extends AbstractClassicRef {

    /* SYNTAX RULES */

    static get syntaxPriority() { return -1; }

    /* SCHEMA API */

    dataType() { return this.ddlSchema()?.dataType() || super.dataType(); }

    lookup(deepMatchCallback, transformer = null, linkedDb = null) {
        if (!transformer && !linkedDb) return [];

        const name = this._get('value');
        const inGrepMode = !name && !deepMatchCallback;
        let resultSet = [];

        const resolve = (columnSchema) => {
            if (!(columnSchema instanceof registry.ColumnSchema)) return false;
            if (name && !columnSchema.identifiesAs(this)) return false;
            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(columnSchema))) return false;
            if (result instanceof AbstractNode || Array.isArray(result)) return result;
            return ColumnRef2.fromJSON({
                ...columnSchema.name().jsonfy({ nodeNames: false }),
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
                if (superParentNode instanceof registry.TableSchema) {
                    return superParentNode;
                }
                const potentialSchema = superParentNode.ddlSchema?.();
                if (potentialSchema instanceof registry.TableSchema) {
                    return potentialSchema;
                }
                return up();
            });
        }

        for (const columnSchema of tableSchemaInScope || []) {
            resultSet = resultSet.concat(resolve(columnSchema) || []);
            if (!inGrepMode && resultSet.length) break; // Matching current instance only
        }

        return resultSet;
    }

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (options.deSugar
            && this.value() !== '*'
            && !this.ddlSchema()
            && (transformer || linkedDb)) {
            return this.resolve(transformer, linkedDb).jsonfy(/* IMPORTANT */);
        }
        return super.jsonfy(options, transformer = null, linkedDb);
    }
}