import { normalizeRelationSelectorArg, parseRelationSelectors } from './util.js';
import { AbstractSQLClient } from './AbstractSQLClient.js';
import { registry } from '../../lang/registry.js';

export class AbstractSQL0Client extends AbstractSQLClient {

    async _showCreate(selector, structured = false) {
        selector = normalizeRelationSelectorArg(selector);
        const sql = this._composeShowCreateSQL(selector);
        const result = await this.driver.query(sql);
        return await this._formatShowCreateResult(result.rows || result, structured);
    }

    _composeShowCreateSQL(selector) {
        const utils = this._createCommonSQLUtils();
        const $parts = {
            fields: [],
            dbWhere: '',
            tblWhere: '',
            orderBy: '',
            depth: 2
        };
        const namespaceNames = Object.keys(selector).filter((s) => s !== '*');
        if (namespaceNames.length) {
            $parts.dbWhere = `\nWHERE ${utils.matchRelationSelector('db.schema_name', namespaceNames)}`;
        }
        const $tblWhere = Object.entries(selector).reduce((cases, [namespaceName, objectNames]) => {
            const tbls = objectNames.filter((s) => s !== '*');
            if (!tbls.length) return cases;
            if (namespaceName === '*') {
                return cases.concat(`tbl.table_name IN ('${tbls.join("', '")}')`);
            }
            return cases.concat(`CASE
                WHEN ${utils.matchRelationSelector('db.schema_name', [namespaceName]) || 'TRUE'
                } THEN ${utils.matchRelationSelector('tbl.table_name', tbls) || 'TRUE'
                } END`);
        }, []);
        $parts.tblWhere = $tblWhere.length ? ` AND (${$tblWhere.join(' OR ')})` : '';
        // -- THE COLUMNS PART
        const buildColumns = () => {
            // Composition
            const fields = {
                table_schema: `cols.table_schema`,
                table_name: `cols.table_name`,
                column_name: `cols.column_name`,
                ordinal_position: `cols.ordinal_position`,
                column_default: `cols.column_default`,
                is_nullable: `cols.is_nullable`,
                data_type: `cols.data_type`,
                character_maximum_length: `cols.character_maximum_length`,
                ...(this.dialect === 'mysql' ? {
                    extra: `cols.extra`,
                } : {
                    is_identity: `cols.is_identity`,
                    identity_generation: `cols.identity_generation`,
                    identity_start: `cols.identity_start`,
                    identity_increment: `cols.identity_increment`,
                    identity_maximum: `cols.identity_maximum`,
                    identity_minimum: `cols.identity_minimum`,
                    identity_cycle: `cols.identity_cycle`,
                }),
                is_generated: `cols.is_generated`,
                generation_expression: `cols.generation_expression`,
            };
            const baseQuery = `
                    SELECT ${Object.entries(fields).map(([k, v]) => `${v} AS ${k}`).join(', ')}
                    FROM information_schema.columns AS cols
                    WHERE cols.table_schema = tbl.table_schema AND cols.table_name = tbl.table_name
                    ORDER BY cols.ordinal_position
                `;
            // Return as an aggregation
            return `SELECT ${utils.jsonAgg(
                utils.jsonBuildObject(Object.keys(fields).reduce(($fields, f) => $fields.concat(`'${f}'`, `cols.${f}`), []))
            )} FROM (${baseQuery}) AS cols`;
        };
        // -- THE CONSTRAINS PART
        const buildConstraints = () => {
            // Composition
            const fields = {
                table_schema: utils.anyValue(`cons.constraint_schema`),
                table_name: utils.anyValue(`cons.table_name`),
                column_name: utils.jsonAgg(`cons_details.column_name`, `cons_details.ordinal_position`),
                constraint_name: `cons.constraint_name`,
                constraint_type: utils.anyValue(`cons.constraint_type`),
                check_clause: utils.anyValue(`check_constraints_details.check_clause`),
                ...(this.dialect === 'mysql' ? {
                    check_constraint_level: utils.anyValue(`check_constraints_details.level`),
                    referenced_column_name: utils.jsonAgg(`cons_details.referenced_column_name`),
                    referenced_table_name: utils.anyValue(`cons_details.referenced_table_name`),
                    referenced_table_schema: utils.anyValue(`cons_details.referenced_table_schema`),
                } : {
                    referenced_column_name: utils.jsonAgg(`relation_details.column_name`),
                    referenced_table_name: utils.anyValue(`relation_details.table_name`),
                    referenced_table_schema: utils.anyValue(`relation_details.table_schema`),
                }),
                referenced_constraint_name: utils.jsonAgg(`relation.unique_constraint_name`),
                match_rule: utils.anyValue(`relation.match_option`),
                update_rule: utils.anyValue(`relation.update_rule`),
                delete_rule: utils.anyValue(`relation.delete_rule`),
            };
            const baseQuery = `
                    SELECT ${Object.entries(fields).map(([k, v]) => `${v} AS ${k}`).join(', ')}
                    FROM information_schema.table_constraints AS cons
                    LEFT JOIN information_schema.key_column_usage AS cons_details
                        ON cons_details.constraint_name = cons.constraint_name
                        AND cons_details.table_name = cons.table_name
                        AND cons_details.constraint_schema = cons.constraint_schema
                        AND cons_details.constraint_catalog = cons.constraint_catalog
                    LEFT JOIN information_schema.check_constraints AS check_constraints_details
                        ON check_constraints_details.constraint_name = cons.constraint_name
                        AND check_constraints_details.constraint_schema = cons.constraint_schema
                        AND check_constraints_details.constraint_catalog = cons.constraint_catalog
                    LEFT JOIN information_schema.referential_constraints AS relation
                        ON relation.constraint_name = cons.constraint_name
                        AND relation.constraint_schema = cons.constraint_schema
                        AND relation.constraint_catalog = cons.constraint_catalog
                    ${this.dialect === 'mysql' ? '' : `
                    LEFT JOIN information_schema.key_column_usage AS relation_details
                        ON relation_details.constraint_name = relation.unique_constraint_name
                        AND relation_details.constraint_schema = relation.unique_constraint_schema
                        AND relation_details.constraint_catalog = relation.unique_constraint_catalog
                        ` }
                    WHERE cons.table_schema = tbl.table_schema AND cons.table_name = tbl.table_name
                    GROUP BY cons.constraint_name
                `;
            // Return as an aggregation
            return `SELECT ${utils.jsonAgg(
                utils.jsonBuildObject(Object.keys(fields).reduce(($fields, f) => $fields.concat(`'${f}'`, `cons.${f}`), []))
            )} FROM (${baseQuery}) AS cons`;
        };
        // -- THE TABLE PART
        const buildTable = (detailed = false) => {
            // Composition
            const fields = { table_name: `tbl.table_name`, table_schema: `tbl.table_schema` };
            const baseQuery = `
                    SELECT ${Object.entries(fields).map(([k, v]) => `${v} AS ${k}`).join(', ')}
                    FROM information_schema.tables AS tbl
                    WHERE tbl.table_schema = db.schema_name AND tbl.table_type = 'BASE TABLE'${$parts.tblWhere}
                `;
            // Return as an aggregation
            const branches = detailed ? [`'columns'`, `(${buildColumns()})`, `'constraints'`, `(${buildConstraints()})`] : [];
            return `SELECT ${utils.jsonAgg(
                utils.jsonBuildObject(Object.keys(fields).reduce(($fields, f) => $fields.concat(`'${f}'`, `tbl.${f}`), []).concat(branches))
            )} FROM (${baseQuery}) AS tbl`;
        };
        $parts.fields.push('db.schema_name');
        if ($parts.depth) $parts.fields.push(`(${buildTable($parts.depth > 1)}) AS tables`);
        let sql = `SELECT ${$parts.fields.join(', ')}
            FROM information_schema.schemata AS db
            ${$parts.dbWhere}${$parts.orderBy}`;
        if (!$parts.dbWhere) {
            sql = `SELECT * FROM (${sql}) AS q WHERE q.tables IS NOT NULL`;
        }
        return sql;
    }

    _createCommonSQLUtils() {
        const utils = {
            //groupConcat: (col, orderBy) => this.dialect === 'mysql' ? `GROUP_CONCAT(${col}${orderBy ? ` ORDER BY ${orderBy}` : ``} SEPARATOR ',')` : `STRING_AGG(${col}, ','${orderBy ? ` ORDER BY ${orderBy}` : ``})`,
            ident: (name) => registry.Identifier.fromJSON({ value: name }, { dialect: this.dialect }),
            str: (value) => registry.StringLiteral.fromJSON({ value }, { dialect: this.dialect }),
            jsonBuildObject: (exprs) => this.dialect === 'mysql' ? `JSON_OBJECT(${exprs.join(', ')})` : `JSON_BUILD_OBJECT(${exprs.join(', ')})`,
            jsonAgg: (expr) => this.dialect === 'mysql' ? `JSON_ARRAYAGG(${expr})` : `JSON_AGG(${expr})`,
            anyValue: (col) => this.dialect === 'mysql' ? col : `MAX(${col})`,
            matchRelationSelector: (ident, enums) => {
                const [names, _names, patterns, _patterns] = parseRelationSelectors(enums);
                const $names = names.length && !(names.length === 1 && names[0] === '*') ? `${ident} IN (${names.map(utils.str).join(', ')})` : null;
                const $_names = _names.length ? `${ident} NOT IN (${_names.map(utils.str).join(', ')})` : null;
                const $patterns = patterns.length ? patterns.map((p) => `${ident} ILIKE ${utils.str(p.replace(/_/g, '\\_'))} ESCAPE '\\'`).join(' AND ') : null;
                const $_patterns = _patterns.length ? patterns.map((p) => `${ident} NOT ILIKE ${utils.str(p.replace(/_/g, '\\_'))} ESCAPE '\\'`).join(' AND ') : null;
                return [$names, $_names, $patterns, $_patterns].filter((s) => s).join(' AND ');
            }
        };
        return utils;
    }

    async _formatShowCreateResult(result, structured) {
        // Util:
        const formatRelation = async (cons) => {
            const consSchema = {
                target_table: { nodeName: 'TABLE_REF2', value: cons.referenced_table_name, qualifier: { nodeName: registry.NamespaceRef.NODE_NAME, value: cons.referenced_table_schema } },
                target_columns: [...new Set(cons.referenced_column_name)].map((s) => ({ nodeName: 'IDENTIFIER', value: s.trim() })),
                referential_rules: [],
            };
            if (cons.match_rule !== 'NONE') {
                consSchema.referential_rules.push({
                    nodeName: 'FK_MATCH_RULE',
                    value: cons.match_rule,
                });
            }
            if (cons.update_rule) {
                consSchema.referential_rules.push({
                    nodeName: 'FK_UPDATE_RULE',
                    action: await registry.ReferentialAction.parse(cons.update_rule, { dialect: this.dialect }),
                });
            }
            if (cons.delete_rule) {
                consSchema.referential_rules.push({
                    nodeName: 'FK_DELETE_RULE',
                    action: await registry.ReferentialAction.parse(cons.delete_rule, { dialect: this.dialect }),
                });
            }
            return consSchema;
        };
        const formatConstraintColumn = (columnNames) => {
            return [...new Set(columnNames.map((col) => col.trim()))].map((col) => ({
                nodeName: 'COLUMN_REF2',
                value: col.trim(),
            }));
        };
        const parseExpr = async (expr) => {
            return (await registry.Expr.parse(expr || '', { dialect: this.dialect })).jsonfy();
        };

        const schemas = [];
        for (const db of result) {

            // Schema def:
            const namespaceSchemaJson = {
                nodeName: registry.NamespaceSchema.NODE_NAME,
                name: { nodeName: registry.NamespaceIdent.NODE_NAME, value: db.schema_name },
                entries: [],
            };

            // Schema tables:
            for (const tbl of db.tables || []) {

                // Table def:
                const tableSchemaJson = {
                    nodeName: 'TABLE_SCHEMA',
                    name: { nodeName: 'TABLE_IDENT', value: tbl.table_name, qualifier: { nodeName: registry.NamespaceRef.NODE_NAME, value: db.schema_name } },
                    entries: [],
                }

                // Table columns:
                for (const col of tbl.columns || []) {

                    // Column def:
                    const columnSchemaJson = {
                        nodeName: 'COLUMN_SCHEMA',
                        name: { nodeName: 'COLUMN_IDENT', value: col.column_name },
                        data_type: { nodeName: 'DATA_TYPE', value: col.data_type, ...(col.character_maximum_length ? { specificity: [await parseExpr(col.character_maximum_length + '')] } : {}) },
                        entries: [],
                    };
                    tableSchemaJson.entries.push(columnSchemaJson);

                    // Column entries:
                    if (col.is_identity/*postgres*/ === 'YES') {
                        columnSchemaJson.entries.push({
                            nodeName: 'COLUMN_IDENTITY_CONSTRAINT',
                            ...(col.identity_generation === 'ALWAYS' ? { always_kw: true } : { by_default_kw: true }),
                            as_identity_kw: true
                        });
                    }
                    if (col.is_generated !== 'NEVER') {
                        // col.is_generated === 'ALWAYS'
                        columnSchemaJson.entries.push({
                            nodeName: 'COLUMN_IDENTITY_CONSTRAINT',
                            expr: await parseExpr(col.generation_expression),
                            stored: 'STORED', // TODO: looks like mysql would be: 'STORED' | 'VIRTUAL'
                        });
                    }
                    if (col.is_nullable === 'NO') {
                        columnSchemaJson.entries.push({
                            nodeName: 'COLUMN_NULL_CONSTRAINT',
                            value: 'NOT',
                        });
                    }
                    if (col.column_default && col.column_default !== 'NULL') {
                        columnSchemaJson.entries.push({
                            nodeName: 'COLUMN_DEFAULT_CONSTRAINT',
                            expr: await parseExpr(col.column_default),
                        });
                    }
                    // MySQL
                    const extras = col.extra/*mysql*/?.split(',').map(s => s.trim()) || [];
                    if (extras.includes('auto_increment')/*mysql*/) {
                        columnSchemaJson.entries.push({
                            nodeName: 'MY_COLUMN_AUTO_INCREMENT_MODIFIER',
                            value: 'AUTO_INCREMENT',
                        });
                    }
                    if (extras.includes('INVISIBLE')/*mysql*/) {
                        columnSchemaJson.entries.push({
                            nodeName: 'MY_COLUMN_VISIBILITY_MODIFIER',
                            value: 'INVISIBLE',
                        });
                    }
                }

                // Table and column constraints
                for (const cons of tbl.constraints || []) {
                    if (cons.constraint_type === 'PRIMARY KEY') {
                        tableSchemaJson.entries.push({
                            nodeName: 'TABLE_PK_CONSTRAINT',
                            name: { value: cons.constraint_name },
                            value: 'KEY',
                            columns: formatConstraintColumn(cons.column_name),
                        });
                    }
                    if (cons.constraint_type === 'UNIQUE') {
                        tableSchemaJson.entries.push({
                            nodeName: 'TABLE_UK_CONSTRAINT',
                            name: { value: cons.constraint_name },
                            columns: formatConstraintColumn(cons.column_name),
                        });
                    }
                    if (cons.constraint_type === 'FOREIGN KEY') {
                        tableSchemaJson.entries.push({
                            nodeName: 'TABLE_FK_CONSTRAINT',
                            name: { value: cons.constraint_name },
                            columns: formatConstraintColumn(cons.column_name),
                            ...(await formatRelation(cons, true)),
                        });
                    }
                    if (cons.constraint_type === 'CHECK' && !(this.dialect === 'postgres' && /^[\d_]+not_null/.test(cons.constraint_name))) {
                        tableSchemaJson.entries.push({
                            nodeName: 'CHECK_CONSTRAINT',
                            name: { value: cons.constraint_name },
                            expr: await parseExpr(cons.check_clause),
                        });
                    }
                }

                (structured ? namespaceSchemaJson.entries : schemas).push(
                    registry.TableSchema.fromJSON(tableSchemaJson, { dialect: this.dialect })
                );
            }

            if (structured) {
                schemas.push(registry.NamespaceSchema.fromJSON(namespaceSchemaJson, { dialect: this.dialect }));
            }
        }

        return schemas;
    }
}