import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractMagicRef } from './abstracts/AbstractMagicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { registry } from '../../registry.js';

export class ColumnRef2 extends AbstractClassicRef {

    /* SYNTAX RULES */

    static get syntaxPriority() { return -1; }

    static morphsTo() { return registry.ColumnRef1; }

    /* SCHEMA API */

    dataType() { return this.resultSchema()?.dataType() || super.dataType(); }

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

            const resultSchema = columnSchema.clone({ normalized: true });
            columnSchema.parentNode._adoptNodes(resultSchema);

            const resolvedColumnRef2 = ColumnRef2.fromJSON({
                ...columnSchema.name().jsonfy({ nodeNames: false }),
                result_schema: resultSchema
            });
            this.parentNode._adoptNodes(resolvedColumnRef2);

            return resolvedColumnRef2;
        };

        let tableSchemaInScope;
        if (this.parentNode instanceof AbstractMagicRef) {
            if (this === this.parentNode.operand()) {
                tableSchemaInScope = this.parentNode.parentNode.rhsSchema(transformer, linkedDb);
            } else {
                tableSchemaInScope = this.parentNode.rhsSchema(transformer, linkedDb);
            }
        } else {
            tableSchemaInScope = this.climbTree((superParentNode, up) => {
                if (superParentNode instanceof registry.InsertStmt) {
                    const tableSchema = [...transformer.statementContext.artifacts.get('tableSchemas')][0].resultSchema;
                    return tableSchema;
                }
                if (superParentNode instanceof registry.TableSchema) {
                    return superParentNode;
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

    jsonfy({ toKind = 2, ...options } = {}, transformer = null, linkedDb = null) {
        if (options.deSugar
            && !this.resultSchema()
            && (transformer || linkedDb)) {
            return this.resolve(transformer, linkedDb).jsonfy(/* IMPORTANT */);
        }
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (toKind === 1) {
            resultJson = {
                ...resultJson,
                nodeName: registry.ColumnRef1.NODE_NAME,
            };
            delete resultJson.qualifier; // by LQ_BACK_REF_ENDPOINT
        }
        return resultJson;
    }
}