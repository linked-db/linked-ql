import { SQLParser } from '../../../lang/SQLParser.js';
import { ConflictError } from '../../errors/ConflictError.js';
import { registry } from '../../../lang/registry.js';

export class RelationDDL {

    #tx;
    #parser;
    #isCreate;
    #bumpLevel = 0;

    // ------

    #id;

    #namespace_id;
    #name;
    #kind;
    #persistence;

    #source_expr_ast;
    #engine_attrs;

    #view_opts_replication_mode;
    #view_opts_replication_origin;
    #view_opts_replication_opts;
    #view_mode_replication_attrs;

    #version_major;
    #version_minor;
    #version_patch;

    // ------

    #columns = [];
    #constraints = [];
    #indexes = [];

    #structuralChanges = {};

    // ------ getters

    get id() { return this.#id; }

    get namespace_id() { return this.#namespace_id; }
    get name() { return this.#name; }
    get kind() { return this.#kind; }
    get persistence() { return this.#persistence; }

    get source_expr_ast() { return this.#source_expr_ast; }
    get engine_attrs() { return this.#engine_attrs; }

    get view_opts_replication_mode() { return this.#view_opts_replication_mode; }
    get view_opts_replication_origin() { return this.#view_opts_replication_origin; }
    get view_opts_replication_opts() { return this.#view_opts_replication_opts; }
    get view_mode_replication_attrs() { return this.#view_mode_replication_attrs; }

    get version_major() { return this.#version_major; }
    get version_minor() { return this.#version_minor; }
    get version_patch() { return this.#version_patch; }

    // ------

    get columns() { return this.#columns; }
    get constraints() { return this.#constraints; }
    get indexes() { return this.#indexes; }

    get structuralChanges() { return this.#structuralChanges; }

    // ------ constructor

    constructor(tx, {
        id = null,

        namespace_id = null,
        name = null,
        kind = null,
        persistence = 'default',

        source_expr_ast = null,
        engine_attrs = null,

        view_opts_replication_mode = null,
        view_opts_replication_origin = null,
        view_opts_replication_opts = null,
        view_mode_replication_attrs = null,

        version_major = 1,
        version_minor = 0,
        version_patch = 0,

        ...unexpected
    } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        this.#tx = tx;
        this.#parser = new SQLParser({ dialect: this.#tx.storageEngine.dialect });
        this.#isCreate = !id;

        this.#id = id;

        this.#namespace_id = namespace_id;
        this.#name = name;
        this.#kind = kind;
        this.#persistence = persistence;

        this.#source_expr_ast = source_expr_ast;
        this.#engine_attrs = engine_attrs;

        this.#view_opts_replication_mode = view_opts_replication_mode;
        this.#view_opts_replication_origin = view_opts_replication_origin;
        this.#view_opts_replication_opts = view_opts_replication_opts;
        this.#view_mode_replication_attrs = view_mode_replication_attrs;

        this.#version_major = version_major;
        this.#version_minor = version_minor;
        this.#version_patch = version_patch;
    }

    setNamespace(value) {
        const prevNsName = this.#namespace_id?.name;
        this.#namespace_id = this.#tx.showNamespace({ name: value });

        if (prevNsName && prevNsName !== value) {
            // Identity change
            this.#bumpLevel = Math.max(this.#bumpLevel, 3);
        }
    }

    setName(value) {
        if (typeof this.#namespace_id !== 'object')
            throw new Error('Namespace must be set in context before setting name');

        if (!/^[a-zA-Z_]/.test(value))
            throw new Error(`Relation name must start with a letter or underscore`);

        const sysTables = this.#tx.getRelation({ namespace: 'sys', name: 'sys_relations' });
        const existing = sysTables.get({ namespace_id: this.#namespace_id.id, name: value }, { using: 'sys_relations__namespace_id_name_idx' });
        if (existing)
            throw new ConflictError(`Relation ${JSON.stringify(this.#namespace_id.name)}.${JSON.stringify(value)} already exists`, existing);

        const prevName = this.#name;
        this.#name = value;

        if (prevName && prevName !== value) {
            // Identity change
            this.#bumpLevel = Math.max(this.#bumpLevel, 3);
        }
    }

    setKind(value) {
        if (!['table', 'view'].includes(value))
            throw new Error(`Invalid relation kind setting ${value}`);
        if (this.#kind && this.#kind !== value)
            throw new Error(`Cannot change relation kind to ${value}`);
        this.#kind = value;
    }

    setPersistence(value) {
        if (!['default', 'temporary'].includes(value))
            throw new Error(`Invalid persistence setting ${value}`);
        this.#persistence = value;
    }

    #setColumns(columns) {
        let reservedColumnConflict;
        if (reservedColumnConflict = columns?.find((col) => col.name.startsWith('__')))
            throw new Error(`[${reservedColumnConflict}] Reserved column namespace "__*"`);
        this.#columns = columns;
    }

    #setConstraints(constraints) {
        this.#constraints = constraints;
    }

    #setIndexes(indexes) {
        this.#indexes = indexes;
    }

    setColumns(columns) {
        if (this.#source_expr_ast)
            throw new TypeError(`Unexpected columns list for an expression-based relation`);
        this.#setColumns(columns);
    }

    setConstraints(constraints) {
        if (this.#source_expr_ast)
            throw new TypeError(`Unexpected constraints list for an expression-based relation`);
        this.#setConstraints(constraints);
    }

    setIndexes(indexes) {
        if (this.#source_expr_ast)
            throw new TypeError(`Unexpected indexes list for an expression-based relation`);
        this.#setIndexes(indexes);
    }

    setEngineAttrs(value = null) {
        // Can be reset to null
        if (value !== null) {
            if (typeof value !== 'object')
                throw new SyntaxError(`engine_attrs must be an object`);

            const attrKeys = Object.keys(value);
            if (attrKeys.length) throw new SyntaxError(`Unexpected attributes: ${attrKeys.map((k) => `engine_attrs.${k}`).join(', ')}`);
        }

        this.#engine_attrs = value;
    }

    setViewOptsReplicationMode(value = null) {
        // Can be reset to null/'none'
        if (value === null && this.#kind === 'view')
            value = 'none';

        if (value !== null) {
            if (this.#kind === 'table')
                throw new Error(`View replication mode must be null for tables. Got ${value}`);

            const modes = ['materialized', 'realtime', 'none'];
            if (!modes.includes(value))
                throw new SyntaxError(`View replication mode must be one of ${modes.join(', ')}. Got ${value}`);
        }

        if (this.#view_opts_replication_mode !== value) {
            this.#view_opts_replication_mode = value;
            this.#structuralChanges.view_opts_replication_mode = true;

            // Behavioral change
            this.#bumpLevel = Math.max(this.#bumpLevel, 1);
        }
    }

    setViewOptsReplicationOrigin(value = null) {
        // Can be reset to null
        if (value !== null) {
            if (this.#kind === 'table')
                throw new Error(`View replication origin must be null for tables. Got ${value}`);

            if (typeof value !== 'string')
                throw new SyntaxError(`View replication origin type must be string. Got type ${typeof value}`);

            if (value !== 'inherit' && !/^(postgres|mysql|flashql)\:/.test(value))
                throw new SyntaxError(`View replication origin must either start with the origin-type scheme: "postgres:", "mysql:", or "flashql:" or be the keyword: "inherit"`);
        }

        if (this.#view_opts_replication_origin !== value) {
            this.#view_opts_replication_origin = value;
            this.#structuralChanges.view_opts_replication_origin = true;

            // Can be structural change
            this.#bumpLevel = Math.max(this.#bumpLevel, 1);
        }
    }

    setViewOptsReplicationOpts(value = null) {
        // Can be reset to null/{}
        if (this.#kind === 'table') {
            if (value !== null)
                throw new Error(`View replication attrs must be null for tables. Got ${value}`);
            this.#view_opts_replication_opts = null;
            return;
        }

        const replicationOpts_defaults = this.#view_opts_replication_mode === 'none'
            ? { join_pushdown_size: null, join_memoization: false }
            : { upstream_mvcc_key: null, write_policy: 'origin_first' };

        this.#view_opts_replication_opts = Object.assign(
            { ...replicationOpts_defaults },
            Object.fromEntries(Object.entries(this.#view_opts_replication_opts || {}).filter(([k]) => k in replicationOpts_defaults))
        );

        if (value === null) return;

        if (typeof value !== 'object')
            throw new SyntaxError(`View replication attrs type must be object. Got type ${typeof value}`);

        let unrecognizedKey;
        if (unrecognizedKey = Object.keys(value).find((k) => !(k in replicationOpts_defaults)))
            throw new SyntaxError(`Unexpected attribute: view_opts_replication_opts.${unrecognizedKey}`);

        if (this.#view_opts_replication_mode === 'none') {
            if (value.join_pushdown_size !== undefined) {
                // Can be reset to null, thus 0
                if (value.join_pushdown_size !== null) {
                    if (!/^\d+$/.test(value.join_pushdown_size))
                        throw new SyntaxError(`view_opts_replication_opts.join_pushdown_size must be numeric; recieved ${value.join_pushdown_size}`);
                }
                this.#view_opts_replication_opts.join_pushdown_size = Number(value.join_pushdown_size);
            }

            if (value.join_memoization !== undefined) {
                // Can be reset to null, thus false
                if (value.join_memoization !== null) {
                    if (!/^(true|false)$/i.test(value.join_memoization + ''))
                        throw new SyntaxError(`view_opts_replication_opts.join_memoization must be true or false; recieved ${value.join_memoization}`);
                }
                this.#view_opts_replication_opts.join_memoization = JSON.parse(((value.join_memoization || 'false') + '').toLowerCase());
            }
        } else {
            if (value.upstream_mvcc_key !== undefined) {
                // Can be reset to null
                if (value.upstream_mvcc_key !== null) {
                    if (typeof value.upstream_mvcc_key !== 'string')
                        throw new SyntaxError(`view_opts_replication_opts.upstream_mvcc_key must be string`);
                }

                this.#view_opts_replication_opts.upstream_mvcc_key = value.upstream_mvcc_key;
                this.#structuralChanges.upstream_mvcc_key = true;
            }

            if (value.write_policy !== undefined) {
                // Can be reset to null
                if (value.write_policy !== null) {
                    if (!['origin_first', 'local_first'].includes(value.write_policy))
                        throw new SyntaxError(`view_opts_replication_opts.write_policy must be either "origin_first" or "local_first"`);
                }

                this.#view_opts_replication_opts.write_policy = value.write_policy || 'origin_first';
                this.#structuralChanges.write_policy = true;
            }
        }

        if (!this.#isCreate) {
            // Behavioral change
            this.#bumpLevel = Math.max(this.#bumpLevel, 1);
        }
    }

    async setSourceExpr(value, columnAliases = []) {
        // ----- Validation
        for (const col of columnAliases || []) {
            for (const k in col) {
                if (k !== 'name') throw new TypeError(`Unexpected ${k} attribute on column alias ${col.name}`);
            }
        }

        // ----- Parsing
        let sourceExprNode;

        if (typeof value.nodeName === 'string') {
            // Exclude any previously injected __upstream_mvcc_tag key
            if (value.select_list) {
                value = {
                    ...value,
                    select_list: { ...value.select_list, entries: value.select_list.entries.filter((si) => si.alias?.value !== '__upstream_mvcc_tag') }
                };
            }
            sourceExprNode = await this.#parser.parse(value);
        } else {
            if (!['string', 'object'].includes(typeof value))
                throw new Error(`"source_expr" must be a string or an object spec or AST`);
            sourceExprNode = await this.#parser.parse(value, { dialect: this.#tx.storageEngine.dialect });
        }

        // ----- Resolution
        let schemaInference;
        let resolvedQuery;

        if (this.#kind === 'view') {
            const effective_replication_origin = this.#view_opts_replication_origin === 'inherit'
                ? this.#namespace_id.view_opts_default_replication_origin
                : this.#view_opts_replication_origin;
            const view_mode_replication_attrs = { effective_replication_origin };
            schemaInference = await this.#tx.storageEngine.getSourceResolver({ kind: 'view', view_mode_replication_attrs });
        } else {
            schemaInference = this.#tx.storageEngine.getResolver();
        }

        const upstream_tx = schemaInference.storageEngine === this.#tx.storageEngine ? this.#tx : null;
        resolvedQuery = await schemaInference.resolveQuery(sourceExprNode, { tx: upstream_tx });

        const selectNode = resolvedQuery instanceof registry.CTE
            ? resolvedQuery.body()
            : resolvedQuery;
        if (!(selectNode instanceof registry.TableStmt) && !(selectNode instanceof registry.SelectStmt))
            throw new SyntaxError(`source_expr must be a valid SELECT statement, TABLE statement, or a CTE of such`);

        const originSchemas = resolvedQuery.originSchemas();

        if (columnAliases.length) {
            let queryJson;

            if (resolvedQuery instanceof registry.TableStmt) {
                queryJson = resolvedQuery.jsonfy({ toSelect: true, resultSchemas: false, });
            } else {
                queryJson = resolvedQuery.jsonfy({ resultSchemas: false, });
            }

            if (columnAliases.length !== queryJson.select_list.entries.length) {
                throw new Error(`View column aliases has ${columnAliases.length} column(s), but query returns ${queryJson.select_list.entries.length}`);
            }

            const newQueryJson = {
                ...queryJson,
                select_list: {
                    ...queryJson.select_list,
                    entries: queryJson.select_list.entries.map((siJson, i) => {
                        if (typeof columnAliases[i].name !== 'string')
                            throw new TypeError(`Input column #${i} is missing a name property or property is invalid`);
                        return {
                            ...siJson,
                            alias: { ...siJson.alias, value: columnAliases[i].name }
                        };
                    }),
                }
            };
            resolvedQuery = await this.#parser.parse(newQueryJson, { dialect: this.#tx.storageEngine.dialect });
        }

        this.#source_expr_ast = resolvedQuery.jsonfy({ resultSchemas: false, originSchemas: false });

        if (this.#kind === 'view') {
            // Analyze AST
            // ------------------
            this.#view_mode_replication_attrs = this.#deriveReplicationAttrs(resolvedQuery);

            // Columns and constrainta
            // ------------------
            let derivedColumns, derivedConstraints = [];

            if (['table', 'schema'].includes(this.#view_mode_replication_attrs.mapping_level)) {
                ({ columns: derivedColumns, constraints: derivedConstraints } = this.#parser.tableAST_to_tableDef(originSchemas[0]));
            } else {
                if (columnAliases.length) {
                    resolvedQuery = await schemaInference.resolveQuery(resolvedQuery, { tx: upstream_tx });
                }
                derivedColumns = resolvedQuery.resultSchema().entries().map((col) => this.#parser.columnAST_to_columnDef(col));
                if (this.#view_mode_replication_attrs.key_columns?.length) {
                    derivedConstraints = [{ kind: 'PRIMARY KEY', columns: this.#view_mode_replication_attrs.key_columns }];
                }
            }

            this.#setColumns(derivedColumns);
            this.#setConstraints(derivedConstraints);

            // Derive reconcilliation parameters for updatable views
            if (this.#view_opts_replication_mode !== 'none'
                && this.#view_mode_replication_attrs.updatable) {

                // Auto-generate system upstream versioning fields for upstream_mvcc_key
                if (this.#view_mode_replication_attrs.effective_upstream_mvcc_key) {
                    if (resolvedQuery instanceof registry.TableStmt) {
                        this.#source_expr_ast = sourceExprNode.jsonfy({ toSelect: true });
                    }

                    const upstreamMvccExpr = {
                        nodeName: 'CAST_EXPR',
                        expr: {
                            nodeName: registry.ColumnRef1.NODE_NAME,
                            value: this.#view_mode_replication_attrs.effective_upstream_mvcc_key
                        },
                        data_type: { nodeName: 'DATA_TYPE', value: 'TEXT' }
                    };

                    // Add a __upstream_mvcc_tag field
                    this.#source_expr_ast.select_list.entries.push({
                        nodeName: registry.SelectItem.NODE_NAME,
                        expr: upstreamMvccExpr,
                        alias: { nodeName: registry.SelectItemAlias.NODE_NAME, value: '__upstream_mvcc_tag', as_kw: true },
                    });

                    // Add a __upstream_mvcc_tag column
                    this.#columns = [{
                        name: '__upstream_mvcc_tag',
                        type: 'TEXT',
                        not_null: false,
                        engine_attrs: { is_system_column: true }
                    }].concat(this.#columns);
                }
            }

            // Add a __staged column
            this.#columns = [{ name: '__staged', type: 'BOOLEAN', not_null: true, default_expr_ast: { nodeName: 'BOOL_LITERAL', value: false }, engine_attrs: { is_system_column: true } }].concat(this.#columns);
        }

        this.#structuralChanges.source_expr_ast = true;

        if (!this.#isCreate) {
            // Structural change
            this.#bumpLevel = Math.max(this.#bumpLevel, 3);
        }
    }

    // ------

    async apply(input, { ifNotExists = false } = {}) {
        // ------------- Identity

        if (this.#isCreate || input.namespace)
            this.setNamespace(input.namespace);

        if (this.#isCreate || ![null, undefined].includes(input.name) && input.name !== this.#name) {
            try { this.setName(input.name); } catch (e) {
                if (e instanceof ConflictError && ifNotExists) return {};
                throw e;
            }
        }

        // ------------- Attributes

        if (![null, undefined].includes(input.kind))
            this.setKind(input.kind);

        if (![null, undefined].includes(input.persistence))
            this.setPersistence(input.persistence);

        if (this.#isCreate || input.view_opts_replication_mode !== undefined)
            this.setViewOptsReplicationMode(input.view_opts_replication_mode);

        if (input.view_opts_replication_origin !== undefined)
            this.setViewOptsReplicationOrigin(input.view_opts_replication_origin);

        if (this.#isCreate || ![null, undefined].includes(input.view_opts_replication_opts))
            this.setViewOptsReplicationOpts(input.view_opts_replication_opts);

        if (input.engine_attrs !== undefined)
            this.setEngineAttrs(input.engine_attrs);

        // ------------- Source expression

        if (![null, undefined].includes(input.source_expr)) {
            if (input.source_expr_ast)
                throw new Error(`Only one of "source_expr" or "source_expr_ast" may be specified`);

            await this.setSourceExpr(input.source_expr, input.column_aliases);
        } else if (![null, undefined].includes(input.source_expr_ast)
            || Object.keys(this.#structuralChanges).length) {

            await this.setSourceExpr(input.source_expr_ast || this.#source_expr_ast, input.column_aliases);
        } else if (this.#isCreate) {
            if (this.#kind === 'view')
                throw new Error(`source_expr must be specified for a view`);
        }

        // ------------- Explicit structure

        if (input.columns?.length) this.#setColumns(input.columns);
        if (input.constraints?.length) this.#setConstraints(input.constraints);
        if (input.indexes?.length) this.#setIndexes(input.indexes);

        // ------------- Engine-specific structure

        if ((this.#isCreate || Object.keys(this.#structuralChanges).length)
            && !(this.#kind === 'view' && this.#view_opts_replication_mode === 'none')) {

            // Auto-generate system primary key columns?
            if (this.#kind === 'view' && this.#view_mode_replication_attrs.mapping_level !== 'table' && this.#view_opts_replication_mode === 'realtime') {
                this.#columns = [{ name: '__id', type: 'TEXT', not_null: true, engine_attrs: { is_system_column: true } }].concat(this.#columns);
                this.#constraints = [{ kind: 'PRIMARY KEY', columns: ['__id'] }].concat(this.#constraints?.filter((con) => con.kind !== 'PRIMARY KEY') || []);
            } else if (!this.#constraints?.find((con) => con.kind === 'PRIMARY KEY')) {
                this.#columns = [{ name: '__id', type: 'INT', is_generated: true, generation_rule: 'by_default', engine_attrs: { is_system_column: true } }].concat(this.#columns);
                this.#constraints = [{ kind: 'PRIMARY KEY', columns: ['__id'] }].concat(this.#constraints?.filter((con) => con.kind !== 'PRIMARY KEY') || []);
            }
        }

        // ------------- Versioning

        for (const a of input.actions || []) {
            switch (a.type) {
                case 'add:column':
                case 'rename:column':
                case 'drop:column':
                case 'add:index':
                case 'rename:index':
                case 'drop:index':
                    this.#bumpLevel = Math.max(this.#bumpLevel, 2);
                    break;
                default:
                    this.#bumpLevel = Math.max(this.#bumpLevel, 1);
                    break;
            }
        }

        if (this.#bumpLevel) {
            const record = this.#tx._versioningCache.get(this.#id) || {
                base: {
                    version_major: this.#version_major,
                    version_minor: this.#version_minor,
                    version_patch: this.#version_patch,
                },
                level: 0,
            };
            record.level = Math.max(record.level, this.#bumpLevel);
            this.#tx._versioningCache.set(this.#id, record);

            if (record.level >= 3) {
                this.#version_major++;
                this.#version_minor = 0;
                this.#version_patch = 0;
            } else if (record.level === 2) {
                this.#version_minor++;
                this.#version_patch = 0;
            } else {
                this.#version_patch++;
            }
        }

        return {
            id: this.#id,

            namespace_id: this.#namespace_id,
            name: this.#name,
            kind: this.#kind,
            persistence: this.#persistence,

            source_expr_ast: this.#source_expr_ast,

            columns: this.#columns,
            constraints: this.#constraints,
            indexes: this.#indexes,

            view_opts_replication_mode: this.#view_opts_replication_mode,
            view_opts_replication_origin: this.#view_opts_replication_origin,
            view_opts_replication_opts: this.#view_opts_replication_opts,
            view_mode_replication_attrs: this.#view_mode_replication_attrs,

            version_major: this.#version_major,
            version_minor: this.#version_minor,
            version_patch: this.#version_patch,

            engine_attrs: this.#engine_attrs,

            structuralChanges: this.#structuralChanges
        };
    }

    #deriveReplicationAttrs(resolvedQuery) {
        // ------------- Base

        const replicationAttrs = {
            // Base
            mapping_level: 'undetermined',
            effective_replication_origin: this.#view_opts_replication_origin,
            // Updateability
            insertable: false,
            updatable: false,
            deletable: false,
            upstream_relation: null,
            column_mapping: null,
            key_columns: null,
            derived_columns: null,
            required_columns: null,
            effective_upstream_mvcc_key: null,
            fixed_predicate: null,
        };

        if (replicationAttrs.effective_replication_origin === 'inherit') {
            if (!(this.#namespace_id && typeof this.#namespace_id === 'object'))
                throw new Error('Table def shape must have a namespace def shape');
            replicationAttrs.effective_replication_origin = this.#namespace_id.view_opts_default_replication_origin;
        }

        // ------------- Early return check

        if (!(resolvedQuery instanceof registry.TableStmt)
            && !(resolvedQuery instanceof registry.CompleteSelectStmt))
            return replicationAttrs;

        // ------------- Base

        const originSchema = resolvedQuery.originSchemas()[0];
        const upstreamColumns = originSchema.columns().map((col) => col.name().value());
        const keyColumns = new Set(originSchema.pkConstraint?.(true)?.columns().map((col) => col.value()) || []);

        const getRequiredColumns = (reverseColumnMapping) => {
            return originSchema.columns().reduce(([required, _required], col) => {
                const colName = col.name().value();

                const allowsNull = col.nullConstraint()?.value() !== 'NOT';
                const isGenerated = !!(col.expressionConstraint()
                    || col.identityConstraint()
                    || col.autoIncrementConstraint());
                const hasDefault = !!col.defaultConstraint();
                const isPrimaryKey = keyColumns.has(colName);

                if ((!allowsNull || isPrimaryKey) && !isGenerated && !hasDefault) {
                    return reverseColumnMapping[colName]
                        ? [required.concat(reverseColumnMapping[colName]), _required]
                        : [required, _required.concat(colName)];
                }

                return [required, _required];
            }, [[], []]);
        };

        const resolveUpstreamRelation = (fromExpr) => ({
            namespace: fromExpr.qualifier()?.value(),
            name: fromExpr.value(),
            keyColumns: [...keyColumns]
        });

        // ------------- Derive for TableStmt

        if (resolvedQuery instanceof registry.TableStmt) {
            const columnMapping = Object.fromEntries(upstreamColumns.map((name) => [name, name]));
            const upstreamRelation = resolveUpstreamRelation(resolvedQuery.tableRef());
            const [requiredColumns] = getRequiredColumns(columnMapping);

            // Assign derivations
            Object.assign(replicationAttrs, {
                mapping_level: 'table',
                insertable: true,
                updatable: true,
                deletable: true,
                upstream_relation: upstreamRelation,
                column_mapping: columnMapping,
                key_columns: [...keyColumns],
                derived_columns: [],
                required_columns: requiredColumns,
                fixed_predicate: null,
            });
        }

        // ------------- Derive for CompleteSelectStmt

        if (resolvedQuery instanceof registry.CompleteSelectStmt) {
            let fromItems;

            // From items must be exactly 1
            if ((fromItems = resolvedQuery.fromClause().entries()).length !== 1
                || !(fromItems[0].expr() instanceof registry.TableRef1))
                return replicationAttrs;

            const clauses = resolvedQuery._keys().filter((k) =>
                k !== 'select_list'
                && k !== 'from_clause'
                && [].concat(resolvedQuery._get(k) || []).length);

            // Assert no other clauses except: where_clause
            if (clauses.filter((k) => k !== 'where_clause').length)
                return replicationAttrs;

            const columnMapping = {};
            const derivedColumns = [];
            let hasColumnRewrites = false;

            const selectList = resolvedQuery.selectList().entries();
            for (const selectItem of selectList) {
                const expr = selectItem.expr();

                const localName = selectItem.alias()?.value()
                    || expr instanceof registry.ColumnRef1 && expr.value();
                if (!localName) return replicationAttrs;

                if (expr instanceof registry.ColumnRef1) {
                    columnMapping[localName] = expr.value();
                    hasColumnRewrites ||= localName !== expr.value();
                } else derivedColumns.push(localName);
            }

            const mappingLevel = derivedColumns.length
                || selectList.length !== upstreamColumns.length
                || hasColumnRewrites
                ? 'derived'
                : (clauses.length ? 'schema' : 'table');
            const upstreamRelation = resolveUpstreamRelation(fromItems[0].expr());
            const reverseColumnMapping = Object.fromEntries(Object.entries(columnMapping).map(([localName, upstreamName]) => [upstreamName, localName]));
            const reverseKeyColumns = [...keyColumns].map((upstreamName) => reverseColumnMapping[upstreamName]).filter(Boolean);
            const [requiredColumns, unexposedButRequired] = getRequiredColumns(reverseColumnMapping);

            Object.assign(replicationAttrs, {
                mapping_level: mappingLevel,
                insertable: !unexposedButRequired.length,
                updatable: true,
                deletable: true,
                upstream_relation: upstreamRelation,
                column_mapping: columnMapping,
                key_columns: reverseKeyColumns,
                derived_columns: derivedColumns,
                required_columns: requiredColumns,
                fixed_predicate: resolvedQuery.whereClause()?.jsonfy() || null,
            });
        }

        // ------------- Derive other attrs

        // Upstream mvcc key
        if (replicationAttrs.updatable
            && this.#view_opts_replication_mode !== 'none') {
            replicationAttrs.effective_upstream_mvcc_key = this.#view_opts_replication_opts.upstream_mvcc_key;

            // Set default upstream_mvcc_key for postgres and flashql
            if (!replicationAttrs.effective_upstream_mvcc_key
                && !replicationAttrs.effective_origin?.startsWith('mysql:'))
                replicationAttrs.effective_upstream_mvcc_key = 'XMIN';

            replicationAttrs.upstream_relation.mvccKey = replicationAttrs.effective_upstream_mvcc_key;
        }

        return replicationAttrs;
    }
}
