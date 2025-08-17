import { DDLSchemaMixin } from '../../abstracts/DDLSchemaMixin.js';
import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { Transformer } from '../../Transformer.js';
import { registry } from '../../registry.js';

export class FromItem extends DDLSchemaMixin(AbstractNode) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };

        const optional_table_sample_clause_postgres = {
            optional: true,
            dialect: 'postgres',
            syntax: [
                { type: 'keyword', value: 'TABLESAMPLE' },
                {
                    syntaxes: [
                        [
                            { type: 'keyword', as: 'pg_sampling_method', value: ['BERNOULLI', 'SYSTEM'] },
                            { type: 'paren_block', syntax: { type: 'Expr', as: 'pg_sampling_arguments', arity: 1, itemSeparator, assert: true } },
                        ],
                        [
                            { type: 'identifier', as: 'pg_sampling_method' },
                            { type: 'paren_block', syntax: { type: 'Expr', as: 'pg_sampling_arguments', arity: Infinity, itemSeparator, assert: true } },
                        ],
                    ],
                    assert: true,
                },
                {
                    optional: true,
                    syntax: [
                        { type: 'keyword', value: 'REPEATABLE' },
                        { type: 'paren_block', syntax: { type: 'Expr', as: 'pg_repeatable_seed' }, assert: true },
                    ]
                }
            ]
        };

        return {
            syntaxes: [
                // SRFTableDef1, SRFTableDef2, SRFTableDef3
                [
                    { type: 'keyword', as: 'lateral_kw', value: 'LATERAL', booleanfy: true, optional: true },
                    { type: 'SRFExpr1', as: 'expr' },
                ],
                [
                    { type: 'keyword', as: 'lateral_kw', value: 'LATERAL', booleanfy: true, optional: true },
                    { type: ['SRFExpr2', 'SRFExpr4'], as: 'expr' },
                    { type: 'FromItemAlias', as: 'alias', optional: true },
                ],
                // DerivedQuery, ValuesTableLiteral
                [
                    { type: 'keyword', as: 'lateral_kw', value: 'LATERAL', booleanfy: true, optional: true },
                    { type: ['DerivedQuery', 'ValuesTableLiteral'], as: 'expr', dialect: 'postgres' },
                    { type: 'DerivedQuery', as: 'expr', dialect: 'mysql' },
                    { type: 'FromItemAlias', as: 'alias', optional: true },
                ],
                // TableRef1
                [
                    { type: 'keyword', as: 'pg_only_kw', value: 'ONLY', optional: true, dialect: 'postgres' },
                    { type: ['TableRef1', 'TableRef2'], as: 'expr' },
                    { type: 'operator', as: 'pg_star_ref', value: '*', booleanfy: true, optional: true, dialect: 'postgres' },
                    { type: 'FromItemAlias', as: 'alias', optional: true },
                    { ...optional_table_sample_clause_postgres },
                ],
            ],
        };
    }

    /* AST API */

    lateralKW() { return this._get('lateral_kw'); }

    expr() { return this._get('expr'); }

    alias() { return this._get('alias'); }

    // -- Postgres

    pgOnlyKW() { return this._get('pg_only_kw'); }

    pgStarRef() { return this._get('pg_star_ref'); }

    pgSamplingMethod() { return this._get('pg_sampling_method'); }

    pgSamplingArguments() { return this._get('pg_sampling_arguments'); }

    pgRepeatableSeed() { return this._get('pg_repeatable_seed'); }

    /* SCHEMA API */

    deriveAlias() {
        let derivedAliasJson;
        if (this.alias()?.value()) {
            derivedAliasJson = { as_kw: true, value: this.alias().value(), delim: this.alias()._get('delim') };
        } else if (this.expr() instanceof registry.TableRef1 || this.expr() instanceof registry.TableRef2) {
            derivedAliasJson = { as_kw: true, value: this.expr().value(), delim: this.expr()._get('delim') };
        } else if (this.expr() instanceof registry.SRFExpr1
            && this.expr().qualif() instanceof registry.SRFExprDDL2) {
            derivedAliasJson = { as_kw: true, value: this.expr().qualif().alias().value(), delim: this.expr().qualif().alias()._get('delim') };
        }
        if (derivedAliasJson) {
            return registry.FromItemAlias.fromJSON(derivedAliasJson);
        }
    }

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        let resultJson = super.jsonfy(options, transformer, linkedDb);
        if (options.deSugar) {

            const derivedAliasJson = resultJson.alias || this.deriveAlias()?.jsonfy();

            const schemaIdent = derivedAliasJson?.value && {
                nodeName: registry.Identifier.NODE_NAME,
                value: derivedAliasJson.value,
                delim: derivedAliasJson.delim,
            };

            let resultSchema = resultJson.expr.result_schema;

            if (resultSchema instanceof registry.TableSchema) {
                resultSchema = resultSchema.clone({ renameTo: schemaIdent });
            } else if (schemaIdent) {
                resultSchema = registry.TableSchema.fromJSON({
                    name: schemaIdent,
                    entries: resultSchema?.entries().map((s) => s.jsonfy()) || [],
                });
            }

            if (resultJson.alias?.columns?.length) {
                if (resultJson.alias.columns.length !== resultSchema.length) {
                    throw new SyntaxError(`[${this}] Number of column aliases must match number of result columns.`);
                }
                resultSchema = resultSchema.clone({}, new Transformer((node, defaultTransform, key) => {
                    if (typeof key === 'number' && node.parentNode === resultSchema) {
                        if (node instanceof registry.ColumnSchema) {
                            return node.jsonfy({ renameTo: resultJson.alias.columns[key] });
                        }
                        return {
                            ...node.jsonfy(),
                            nodeName: registry.ColumnSchema.NODE_NAME,
                            name: resultJson.alias.columns[key],
                        };
                    }
                    return defaultTransform();
                }));
            }

            transformer.statementContext.artifacts.get('tableSchemas').add({ type: this.joinType?.() || 'dql', lateral: this.lateralKW(), resultSchema });

            const applicableAliasJson = !(this.expr() instanceof registry.SRFExpr1) && (
                Number(options.deSugar) > 2 || Number(options.deSugar) > 1 && (this.parentNode?.entries().length || 0) > 1
            ) && derivedAliasJson || resultJson.alias;
            resultJson = {
                ...resultJson,
                alias: applicableAliasJson,
                result_schema: resultSchema,
            };
        }

        return resultJson;
    }
}