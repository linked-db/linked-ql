import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { PathMixin } from '../../abstracts/PathMixin.js';
import { JSONSchema } from '../../abstracts/JSONSchema.js';
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
        return this.buildSyntaxRules({
            syntaxes: [
                { type: 'identifier', as: '.' },
                { type: 'operator', as: '.', value: '*' },
            ],
            autoSpacing: false
        });
    }

    static get syntaxPriority() { return 51; } // above LQBackRefAbstraction

    /* API */

    dataType() { return this.ddlSchema()?.dataType() || super.dataType(); }

    canReferenceOutputColumns() {
        return this.climbTree((parentNode, up) => {
            if (parentNode instanceof registry.SelectStmt) return false;
            if (parentNode instanceof registry.GroupByClause) return parentNode;
            if (parentNode instanceof registry.HavingClause) return parentNode;
            if (parentNode instanceof registry.OrderByClause) return parentNode;
            return up();
        });
    }

    lookup(deepMatchCallback = null, transformer = null, linkedDb = null) {
        if (!transformer && !linkedDb) return [];

        const name = this._get('value');
        const inGrepMode = !name && !deepMatchCallback;
        let resultSet = [];

        const resolve = (columnSchema, qualifierJson = undefined) => {
            if (!(columnSchema instanceof registry.ColumnSchema)) return false;
            if (name && !columnSchema.identifiesAs(this)) return false;
            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(columnSchema, qualifierJson))) return false;
            if (result instanceof AbstractNode || Array.isArray(result)) return result;

            const result_schema = columnSchema.clone({ normalized: true });
            columnSchema.parentNode._adoptNodes(result_schema);

            const resolvedColumnRef1 = ColumnRef1.fromJSON({
                ...columnSchema.name().jsonfy({ nodeNames: false }),
                result_schema,
                qualifier: qualifierJson
            });
            this.parentNode._adoptNodes(resolvedColumnRef1);
            
            return resolvedColumnRef1;
        };

        // Resolve normally
        resultSet = resultSet.concat((new registry.TableRef1(this.qualifier()?.jsonfy() || {})).lookup(
            (tableSchema, qualifierJson = undefined) => {

                return tableSchema._get('entries').reduce((prev, columnSchema) => {
                    if (tableSchema instanceof JSONSchema) {
                        // An unaliased derived query
                        return prev.concat(resolve(columnSchema) || []);
                    }
                    const newQualifierJson = {
                        ...tableSchema.name().jsonfy({ nodeNames: false }),
                        result_schema: tableSchema,
                        qualifier: qualifierJson
                    };
                    return prev.concat(resolve(columnSchema, newQualifierJson) || []);
                }, []);

            },
            transformer,
            linkedDb,
        ));

        if (inGrepMode || !resultSet.length) {
            if (this.canReferenceOutputColumns()) {
                // Resolve from outputSchemas first
                let statementContext = transformer.statementContext
                do {
                    for (const columnSchema of statementContext.artifacts.get('outputSchemas')) {
                        resultSet = resultSet.concat(resolve(columnSchema) || []);
                        if (!inGrepMode && resultSet.length) break; // Matching current instance only
                    }
                } while ((inGrepMode || !resultSet.length) && (statementContext = statementContext.superContext?.statementContext))
            }
        }

        return resultSet;
    }

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if ((options.deSugar || options.fullyQualified)
            && this.value() !== '*'
            && (!this.qualifier()
                || !this.ddlSchema())
            && (transformer || linkedDb)) {
            return this.resolve(transformer, linkedDb).jsonfy(/* IMPORTANT */);
        }
        return super.jsonfy(options, transformer, linkedDb);
    }
}