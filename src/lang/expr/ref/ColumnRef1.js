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

    lookup(deepMatchCallback, linkedContext, linkedDb) {
        const inGrepMode = !this._get('value');
        let resultSet = [];

        const resolve = (columnSchema, qualifierJson = undefined) => {
            if (!(columnSchema instanceof registry.ColumnSchema)) return false;
            if (!(inGrepMode || columnSchema.identifiesAs(this))) return false;
            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(columnSchema, qualifierJson))) return false;
            if (result instanceof AbstractNode) return result;
            return ColumnRef1.fromJSON({
                value: columnSchema.name().value(),
                result_schema: columnSchema,
                qualifier: qualifierJson
            });
        };

        if (this.canReferenceOutputColumns()) {
            // Resolve from outputSchemas first
            let statementContext = linkedContext.statementContext
            do {
                for (const columnSchema of statementContext.artifacts.get('outputSchemas')) {
                    let result;
                    if (result = resolve(columnSchema)) {
                        resultSet.push(result);
                        if (!inGrepMode) break; // Matching current instance only
                    }
                }
            } while ((inGrepMode || !resultSet.length) && (statementContext = statementContext.superContext?.statementContext))
        }

        if (inGrepMode || !resultSet.length) {
            // Resolve normally
            resultSet = resultSet.concat((new registry.TableRef1(this.qualifier()?.jsonfy() || {})).lookup(
                (tableSchema, qualifierJson = undefined) => {
                    return tableSchema._get('entries').reduce((prev, columnSchema) => {
                        if (prev) return prev;
                        const newQualifierJson = {
                            value: tableSchema.name().value(),
                            result_schema: tableSchema,
                            qualifier: qualifierJson
                        };
                        return resolve(columnSchema, newQualifierJson);
                    }, null);
                },
                linkedContext,
                linkedDb,
                true
            ));
        }

        return resultSet;
    }

    jsonfy(options = {}, linkedContext = null, linkedDb = null) {
        if ((options.deSugar || options.fullyQualified)
            && this.value() !== '*'
            && !this.qualifier()
            && !this.ddlSchema()
            && (linkedContext || linkedDb)) {
            return this.resolve(linkedContext, linkedDb).jsonfy(/* IMPORTANT */);
        }
        return super.jsonfy(options, linkedContext, linkedDb);
    }
}