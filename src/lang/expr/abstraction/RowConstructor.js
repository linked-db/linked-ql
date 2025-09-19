import { TypeSysMixin } from '../../abstracts/TypeSysMixin.js';
import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';

export class RowConstructor extends DDLSchemaMixin(TypeSysMixin(AbstractNodeList)) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return {
            syntax: [
                {
                    type: 'paren_block',
                    syntax: {
                        type: [
                            'DerivedQuery'/* to support dimensional RHS in DML, and should appear before Expr.RowConstructor */,
                            'ValuesTableLiteral',
                            'Expr',
                        ], as: 'entries', arity: Infinity, itemSeparator, autoIndent: 10
                    },
                },
            ],
        };
    }

    static get syntaxPriority() { return 49; } // Below all () shapes like LQBackRefAbstraction but above DerivedQuery 

    /* API */

    exprUnwrapped() {
        if (this._get('entries')?.length === 1 && this._get('entries')[0] instanceof RowConstructor) {
            return this._get('entries')[0].exprUnwrapped();
        }
        return this;
    }

    /* TYPESYS */

    dataType() { return registry.DataType.fromJSON({ value: 'SET' }); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, dbContext = null) {
        let resultJson = super.jsonfy(options, transformer, dbContext);
        if (Number(options.deSugar || 0) > 5 || options.forceDeSugar) {

            const entriesNode = this.entries() || [];
            const entriesJson = resultJson.entries || [];

            const resultSchemas = entriesJson.map((entry, i) => {
                const ident = { nodeName: registry.Identifier.NODE_NAME, value: i };
                if (entry.result_schema instanceof registry.ColumnSchema) {
                    return entry.result_schema.clone({ renameTo: ident });
                }
                return registry.ColumnSchema.fromJSON({
                    name: ident,
                    data_type: entriesNode[i].dataType().jsonfy(),
                });
            });

            resultJson = {
                ...resultJson,
                result_schema: registry.JSONSchema.fromJSON({ entries: resultSchemas }, { assert: true }),
            };
        }

        return resultJson;
    }
}