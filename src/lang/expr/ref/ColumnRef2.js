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

    lookup(deepMatchCallback, transformer = null, schemaInference = null) {
        if (!transformer && !schemaInference) return [];

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

        let tableSchemasInScope;
        if (this.parentNode instanceof AbstractMagicRef) {
            if (this === this.parentNode.operand()) {
                tableSchemasInScope = [this.parentNode.parentNode.rhsSchema(transformer, schemaInference)];
            } else {
                tableSchemasInScope = [this.parentNode.rhsSchema(transformer, schemaInference)];
            }
        } else {
            tableSchemasInScope = this.climbTree((superParentNode, up) => {
                if (superParentNode instanceof registry.InsertStmt || superParentNode instanceof registry.UpdateStmt) {
                    let tableSchemas = [...transformer.statementContext.artifacts.get('tableSchemas')].map((t) => t.resultSchema);
                    // For UPDATEs, and of cos INSERTs, postgres target columns are resolved from just the target table
                    if (this.options.dialect !== 'mysql') {
                        tableSchemas = tableSchemas.slice(0, 1);
                    }
                    return tableSchemas;
                }
                if (superParentNode instanceof registry.TableSchema) {
                    return [superParentNode];
                }
                return up();
            });
        }

        outer: for (const tableSchema of tableSchemasInScope || []) {
            for (const columnSchema of tableSchema) {
                resultSet = resultSet.concat(resolve(columnSchema) || []);
                if (!inGrepMode && resultSet.length) break outer; // Matching current instance only
            }
        }

        return resultSet;
    }

    jsonfy({ toKind = 2, ...options } = {}, transformer = null, schemaInference = null) {
        if (options.deSugar
            && !this.resultSchema()
            && (transformer || schemaInference)) {
            return this.resolve(transformer, schemaInference).jsonfy(/* IMPORTANT */);
        }
        let resultJson = super.jsonfy(options, transformer, schemaInference);
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