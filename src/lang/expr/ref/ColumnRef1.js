import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { PathMixin } from '../../abstracts/PathMixin.js';
import { registry } from '../../registry.js';

export class ColumnRef1 extends PathMixin(AbstractClassicRef) {

    /* SYNTAX RULES */

    static get _qualifierType() {
        return [
            'TableRef1'/* must come first being primary */,
            'LQBackRefAbstraction'
        ];
    }

    static get syntaxRules() {
        return this.buildSyntaxRules({ type: 'identifier', as: '.', autoSpacing: false });
    }

    static get syntaxPriority() { return 51; } // above LQBackRefAbstraction

    static morphsTo() { return registry.ColumnRef2; }

    /* API */

    dataType() { return this.resultSchema()?.dataType() || super.dataType(); }
    
    // ----------------

    canReferenceOutputColumns() {
        return this.climbTree((parentNode, up) => {
            if (parentNode instanceof registry.SelectStmt) return false;
            if (parentNode instanceof registry.GroupByClause) return parentNode;
            if (parentNode instanceof registry.HavingClause) return parentNode;
            if (parentNode instanceof registry.OrderByClause) return parentNode;
            return up();
        });
    }

    lookup(deepMatchCallback = null, transformer = null, schemaInference = null) {
        if (!transformer && !schemaInference) return [];

        const name = this._get('value');
        const inGrepMode = (!name || name === '*') && !deepMatchCallback;
        let resultSet = [];

        const resolve = (columnSchema, qualifierJson = undefined, resolution = 'default') => {

            if (!(columnSchema instanceof registry.ColumnSchema)) return false;
            if (name && name !== '*' && !columnSchema.identifiesAs(this)) return false;

            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(columnSchema, qualifierJson, resolution))) return false;
            if (result instanceof AbstractNode || Array.isArray(result)) return result;

            const resultSchema = columnSchema.clone({ normalized: true });
            columnSchema.parentNode?._adoptNodes(resultSchema);

            const resolvedColumnRef1 = ColumnRef1.fromJSON({
                ...columnSchema.name().jsonfy({ nodeNames: false }),
                resolution,
                qualifier: qualifierJson,
                result_schema: resultSchema,
            });

            this.parentNode._adoptNodes(resolvedColumnRef1);

            return resolvedColumnRef1;
        };

        // 1. Resolve system refs statically
        const systemColumns = (this.options.dialect || 'postgres') === 'postgres'
            ? ['CTID', 'OID', 'XMIN', 'XMAX', 'TABLEOID']
            : [];
        if (systemColumns.includes(name?.toUpperCase())) {
            const columnSchema = registry.ColumnSchema.fromJSON({
                name: { nodeName: registry.Identifier.NODE_NAME, value: name },
                data_type: { nodeName: registry.DataType.NODE_NAME, value: 'INT' },
            }, { assert: true });
            return [].concat(resolve(columnSchema, undefined, 'system') || []);
        }

        // 2. Resolve from outputSchemas first?
        if (this.canReferenceOutputColumns() && transformer) {
            // Resolve from outputSchemas first
            let statementContext = transformer.statementContext
            for (const columnSchema of statementContext.artifacts.get('outputSchemas')) {
                resultSet = resultSet.concat(resolve(columnSchema, undefined, 'scope') || []);
                if (!inGrepMode && resultSet.length) break; // Matching current instance only
            }
        }

        // 3. Resolve normally
        if (inGrepMode || !resultSet.length) {
            // Resolve normally
            const tempTableRef = new registry.TableRef1(this.qualifier()?.jsonfy() || {});
            this._adoptNodes(tempTableRef);
            resultSet = resultSet.concat(tempTableRef.lookup(
                (tableSchema, qualifierJson = undefined, resolution = undefined) => {

                    return tableSchema._get('entries').reduce((prev, columnSchema) => {
                        if (tableSchema instanceof registry.JSONSchema) {
                            // An unaliased derived query
                            return prev.concat(resolve(columnSchema) || []);
                        }
                        const newQualifierJson = {
                            ...tableSchema.name().jsonfy({ nodeNames: false }),
                            resolution,
                            qualifier: qualifierJson,
                            result_schema: tableSchema,
                        };
                        return prev.concat(resolve(columnSchema, newQualifierJson) || []);
                    }, []);

                },
                transformer,
                schemaInference,
            ));
        }

        if (name === '*') {
            const compositeResult = registry.ColumnRef0.fromJSON({
                value: this.value(),
                result_schema: registry.JSONSchema.fromJSON({ entries: resultSet.map((s) => s.clone()) }, { assert: true }),
            });
            this.parentNode._adoptNodes(compositeResult);
            resultSet = [compositeResult];
        }

        return resultSet;
    }

    jsonfy({ toKind = 1, ...options } = {}, transformer = null, schemaInference = null) {
        let resultJson;
        if (options.deSugar && (
            ((options.deSugar === true || options.deSugar.columnQualifiers) && !this.qualifier())
            || !this.resultSchema()
        ) && (transformer || schemaInference)) {
            // Column qualification or schema resolution...
            resultJson = this.resolve(transformer, schemaInference).jsonfy(/* IMPORTANT */);
            // Case normalization...
            if ((options.deSugar === true || options.deSugar.normalizeCasing) && !resultJson.delim) {
                resultJson = { ...resultJson, value: resultJson.resolution === 'system' ? resultJson.value.toUpperCase() : resultJson.value.toLowerCase() };
            }
            // Drop qualifier...
            if (!(options.deSugar === true || options.deSugar.columnQualifiers) && !this.qualifier()) {
                resultJson = { ...resultJson, qualifier: undefined };
            }
        } else {
            resultJson = super.jsonfy(options, transformer, schemaInference);
            if (toKind === 2) {
                resultJson = {
                    ...resultJson,
                    nodeName: registry.ColumnRef2.NODE_NAME,
                };
                delete resultJson.qualifier;
            }
        }
        return resultJson;
    }
}