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
        const inGrepMode = (!name || name === '*') && !deepMatchCallback;
        let resultSet = [];

        const resolve = (columnSchema, qualifierJson = undefined) => {

            if (!(columnSchema instanceof registry.ColumnSchema)) return false;
            if (name && name !== '*' && !columnSchema.identifiesAs(this)) return false;

            let result;
            if (deepMatchCallback && !(result = deepMatchCallback(columnSchema, qualifierJson))) return false;
            if (result instanceof AbstractNode || Array.isArray(result)) return result;

            const resultSchema = columnSchema.clone({ normalized: true });
            columnSchema.parentNode._adoptNodes(resultSchema);

            const resolvedColumnRef1 = ColumnRef1.fromJSON({
                ...columnSchema.name().jsonfy({ nodeNames: false }),
                result_schema: resultSchema,
                qualifier: qualifierJson
            });

            this.parentNode._adoptNodes(resolvedColumnRef1);

            return resolvedColumnRef1;
        };

        if (this.canReferenceOutputColumns() && transformer) {
            // Resolve from outputSchemas first
            let statementContext = transformer.statementContext
            for (const columnSchema of statementContext.artifacts.get('outputSchemas')) {
                resultSet = resultSet.concat(resolve(columnSchema) || []);
                if (!inGrepMode && resultSet.length) break; // Matching current instance only
            }
        }

        if (inGrepMode || !resultSet.length) {
            // Resolve normally
            resultSet = resultSet.concat((new registry.TableRef1(this.qualifier()?.jsonfy() || {})).lookup(
                (tableSchema, qualifierJson = undefined) => {

                    return tableSchema._get('entries').reduce((prev, columnSchema) => {
                        if (tableSchema instanceof registry.JSONSchema) {
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

    jsonfy({ toKind = 1, ...options } = {}, transformer = null, linkedDb = null) {
        if (options.deSugar && this.qualifier()?.identifiesAs((options.toDialect || this.options.dialect) === 'mysql' ? 'VALUES' : 'EXCLUDED')) {
            options = { ...options, deSugar: 0 };
        }
        if (options.deSugar
            && ((!this.qualifier() && Number(options.deSugar) > 1)
                || !this.resultSchema())
            && (transformer || linkedDb)) {
            const resolvedJson = this.resolve(transformer, linkedDb).jsonfy(/* IMPORTANT */);
            if (Number(options.deSugar) < 2 && !this.qualifier()) {
                return { ...resolvedJson, qualifier: undefined };
            }
            return resolvedJson;
        }
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (toKind === 2) {
			resultJson = {
                ...resultJson,
				nodeName: registry.ColumnRef2.NODE_NAME,
			};
            delete resultJson.qualifier;
		}
        return resultJson;
    }
}