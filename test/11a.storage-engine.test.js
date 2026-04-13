import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { StorageEngine } from '../src/flashql/storage/StorageEngine.js';
import { TableStorage } from '../src/flashql/storage/TableStorage.js';
import { ConflictError } from '../src/flashql/errors/ConflictError.js';
import { InMemoryKV } from '@webqit/keyval/inmemory';
import { FlashQL } from '../src/flashql/FlashQL.js';

const testTableFeeds = [
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_relations', keyColumns: ['id'] },
        new: { id: 501, namespace_id: 101, name: 'test', kind: 'table', persistence: 'default', version_major: 1, version_minor: 0, version_patch: 0 }
    },

    // columns & constraints
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_columns', keyColumns: ['id'] },
        new: { id: 5001, relation_id: 501, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null }
    },
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_columns', keyColumns: ['id'] },
        new: { id: 5002, relation_id: 501, name: 'name', position: 2, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null }
    },
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_constraints', keyColumns: ['id'] },
        new: { id: 5001, relation_id: 501, name: 'public_test_pk', kind: 'PRIMARY KEY', column_ids: [5001], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
    },

    // data for test
    {
        op: 'insert',
        relation: { namespace: 'public', name: 'test', keyColumns: ['id'] },
        new: { id: 1, name: 'John Doe' }
    },
    {
        op: 'insert',
        relation: { namespace: 'public', name: 'test', keyColumns: ['id'] },
        new: { id: 2, name: 'Jane Doe' }
    }
];

const createEngine = async ({ withTestTable = false, ...params } = {}) => {
    const storageEngine = new StorageEngine(params);
    await storageEngine.open();
    if (withTestTable) {
        await storageEngine.transaction(async (tx) => await tx.replay(testTableFeeds));
    }
    return storageEngine;
};

const createUsersTable = async (tx, { tableName = 'users' } = {}) => {
    await tx.createTable({
        namespace: 'public',
        name: tableName,
        columns: [
            { name: 'id', type: 'INT', not_null: true, is_generated: true, generation_rule: 'by_default' },
            { name: 'parent_id', type: 'INT' },
            { name: 'fname', type: 'TEXT', not_null: true },
            { name: 'lname', type: 'TEXT', default_expr: "'Doe'" },
            { name: 'full_name', type: 'TEXT', is_generated: true, generation_expr: "fname || ' ' || lname", generation_rule: 'always' },
        ],
        constraints: [
            { kind: 'PRIMARY KEY', columns: ['id'] },
            { kind: 'UNIQUE', columns: ['fname'] },
            {
                kind: 'FOREIGN KEY',
                columns: ['parent_id'],
                target_relation: tableName,
                target_columns: ['id'],
                match_rule: 'NONE',
                update_rule: 'CASCADE',
                delete_rule: 'CASCADE',
            },
        ],
    });

    return tx.getRelation({ namespace: 'public', name: tableName });
};

describe('StorageEngine - Bootstrapping And Transactions', () => {
    it('bootstraps userspace catalog: public', async () => {
        const storageEngine = await createEngine();

        const tx = storageEngine.begin();
        expect(tx.listNamespaces()).to.include('public');
        expect(tx.listTables({ namespace: 'public' })).to.be.empty;
    });

    it('commits via transaction() helper', async () => {
        const storageEngine = await createEngine({ withTestTable: true });

        await storageEngine.transaction(async (tx) => {
            const table = tx.getRelation({ namespace: 'public', name: 'test' });
            await table.insert({ id: 7001, name: 'Committed' });
        });

        const tx = storageEngine.begin();
        const table = tx.getRelation({ namespace: 'public', name: 'test' });
        expect(table.get(7001)).to.deep.include({ id: 7001, name: 'Committed' });
    });

    it('aborts via transaction() helper on throw', async () => {
        const storageEngine = await createEngine({ withTestTable: true });

        await expect(storageEngine.transaction(async (tx) => {
            const table = tx.getRelation({ namespace: 'public', name: 'test' });
            await table.insert({ id: 7002, name: 'RolledBack' });
            throw new Error('force rollback');
        })).to.be.rejectedWith('force rollback');

        const tx = storageEngine.begin();
        const table = tx.getRelation({ namespace: 'public', name: 'test' });
        expect(table.get(7002)).to.be.null;
    });

    it('applies WAL-shaped changefeeds through storage wal.applyDownstreamCommit()', async () => {
        const storageEngine = await createEngine({ withTestTable: true });

        await storageEngine.wal.applyDownstreamCommit({
            entries: [
                {
                    op: 'update',
                    relation: { namespace: 'public', name: 'test', keyColumns: ['id'] },
                    old: { id: 1, name: 'John Doe' },
                    new: { id: 1, name: 'John Wick' }
                },
                {
                    op: 'insert',
                    relation: { namespace: 'public', name: 'test', keyColumns: ['id'] },
                    new: { id: 3, name: 'New User' }
                }
            ]
        });

        const tx = storageEngine.begin();
        const table = tx.getRelation({ namespace: 'public', name: 'test' });
        expect(table.get(1)).to.deep.include({ id: 1, name: 'John Wick' });
        expect(table.get(3)).to.deep.include({ id: 3, name: 'New User' });
    });

    it('rejects wal.applyDownstreamCommit() writes when the expected XMIN no longer matches', async () => {
        const storageEngine = await createEngine({ withTestTable: true });

        const tx = storageEngine.begin();
        const table = tx.getRelation({ namespace: 'public', name: 'test' });
        const row = table.get(1, { hiddenCols: true });
        await tx.rollback();

        // Omits the mvccTag
        await expect(storageEngine.wal.applyDownstreamCommit({
            entries: [
                {
                    op: 'update',
                    relation: { namespace: 'public', name: 'test', keyColumns: ['id'], mvccKey: 'XMIN' },
                    old: { id: 1, name: 'John Doe', },
                    new: { id: 1, name: 'John Conflict' },
                    //mvccTag: row.XMIN + 999
                }
            ],
        })).to.be.rejectedWith(SyntaxError);

        // Specifies the mvccTag but invalid
        await expect(storageEngine.wal.applyDownstreamCommit({
            entries: [
                {
                    op: 'update',
                    relation: { namespace: 'public', name: 'test', keyColumns: ['id'], mvccKey: 'XMIN' },
                    old: { id: 1, name: 'John Doe', },
                    new: { id: 1, name: 'John Conflict' },
                    mvccTag: row.XMIN + 999
                }
            ],
        })).to.be.rejectedWith(ConflictError);

        const verifyTx = storageEngine.begin();
        const verifyTable = verifyTx.getRelation({ namespace: 'public', name: 'test' });
        expect(verifyTable.get(1)).to.deep.include({ id: 1, name: 'John Doe' });
        await verifyTx.rollback();
    });
});

describe('StorageEngine - DDL', () => {
    let storageEngine;

    beforeEach(async () => {
        storageEngine = await createEngine({
            autoSync: false,
            getUpstreamClient: async () => new FlashQL({ storageEngine }),
        });
    });

    it('creates table and exposes schema metadata', async () => {
        const tx = storageEngine.begin();
        const users = await createUsersTable(tx);

        expect(users.schema.columns.has('id')).to.be.true;
        expect(users.schema.columns.has('full_name')).to.be.true;
        expect(users.schema.keyColumns).to.deep.eq(['id']);
        expect([...users.schema.constraints.keys()]).to.include('PRIMARY KEY');
        expect([...users.schema.constraints.keys()]).to.include('FOREIGN KEY');
    });

    it('exposes a canonical write spec for updateable remote-backed views', async () => {
        const tx = storageEngine.begin();
        await tx.createNamespace({
            name: 'remote_views',
            view_opts_default_replication_origin: 'flashql:primary',
        });
        await tx.createTable({
            namespace: 'remote_views',
            name: 'src',
            columns: [
                { name: 'id', type: 'INT', not_null: true },
                { name: 'name', type: 'TEXT', not_null: true },
            ],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });
        await tx.createView({
            namespace: 'remote_views',
            name: 'v_users',
            source_expr: 'SELECT id AS user_id, name AS full_name FROM remote_views.src',
            replication_mode: 'materialized',
            replication_origin: 'inherit',
            replication_opts: { write_policy: 'local_first' },
        });

        const viewDef = tx.showTable({ namespace: 'remote_views', name: 'v_users' }, { schema: true });
        expect(viewDef.view_opts_replication_opts.write_policy).to.eq('local_first');
        expect(viewDef.columns.get('__staged')).to.deep.include({ name: '__staged', not_null: true });
        expect(viewDef.view_mode_replication_attrs).to.deep.eq({
            mapping_level: 'derived',
            effective_replication_origin: 'flashql:primary',
            insertable: true,
            updatable: true,
            deletable: true,
            upstream_relation: {
                namespace: 'remote_views',
                name: 'src',
                keyColumns: ['id'],
                mvccKey: 'XMIN'
            },
            column_mapping: { user_id: 'id', full_name: 'name' },
            key_columns: ['user_id'],
            derived_columns: [],
            required_columns: ['user_id', 'full_name'],
            effective_upstream_mvcc_key: 'XMIN',
            fixed_predicate: null
        });
    });

    it('rejects duplicate table names in a namespace', async () => {
        const tx = storageEngine.begin();
        await createUsersTable(tx, { tableName: 'dup_tbl' });

        await expect(tx.createTable({
            namespace: 'public',
            name: 'dup_tbl',
            columns: [{ name: 'id', type: 'INT' }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        })).to.be.rejected;
    });

    it('supports createTable with ifNotExists', async () => {
        const tx = storageEngine.begin();
        await createUsersTable(tx, { tableName: 'dup_tbl_if_not_exists' });

        await expect(tx.createTable({
            namespace: 'public',
            name: 'dup_tbl_if_not_exists',
            columns: [{ name: 'id', type: 'INT' }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        }, { ifNotExists: true })).to.not.be.rejected;
    });

    it('alters table name and updates namespace listing', async () => {
        const tx = storageEngine.begin();
        await createUsersTable(tx, { tableName: 'to_rename' });

        await tx.alterTable({ namespace: 'public', name: 'to_rename' }, { name: 'renamed_tbl' });

        const tables = tx.listTables({ namespace: 'public' });
        expect(tables).to.include('renamed_tbl');
        expect(tables).to.not.include('to_rename');
    });

    it('creates, renames and drops an index', async () => {
        const tx = storageEngine.begin();
        await createUsersTable(tx, { tableName: 'idx_tbl' });

        await tx.createIndex({
            namespace: 'public',
            table: 'idx_tbl',
            name: 'idx_tbl__fname_manual_idx',
            method: 'hash',
            is_unique: false,
            kind: 'column',
            columns: ['fname'],
        });

        let table = tx.getRelation({ namespace: 'public', name: 'idx_tbl' });
        expect(table.schema.indexes.has('idx_tbl__fname_manual_idx')).to.be.true;

        await tx.alterIndex({ namespace: 'public', table: 'idx_tbl', name: 'idx_tbl__fname_manual_idx' }, { name: 'idx_tbl__fname_manual_idx2' });
        table = tx.getRelation({ namespace: 'public', name: 'idx_tbl' });
        expect(table.schema.indexes.has('idx_tbl__fname_manual_idx2')).to.be.true;

        await tx.dropIndex({ namespace: 'public', table: 'idx_tbl', name: 'idx_tbl__fname_manual_idx2' });
        table = tx.getRelation({ namespace: 'public', name: 'idx_tbl' });
        expect(table.schema.indexes.has('idx_tbl__fname_manual_idx2')).to.be.false;
    });

    it('enforces dropTable RESTRICT and supports CASCADE', async () => {
        const tx = storageEngine.begin();

        await tx.createTable({
            namespace: 'public',
            name: 'parent_tbl',
            columns: [{ name: 'id', type: 'INT', is_generated: true, generation_rule: 'by_default' }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });

        await tx.createTable({
            namespace: 'public',
            name: 'child_tbl',
            columns: [
                { name: 'id', type: 'INT', is_generated: true, generation_rule: 'by_default' },
                { name: 'parent_id', type: 'INT' },
            ],
            constraints: [
                { kind: 'PRIMARY KEY', columns: ['id'] },
                {
                    kind: 'FOREIGN KEY',
                    columns: ['parent_id'],
                    target_relation: 'parent_tbl',
                    target_columns: ['id'],
                    update_rule: 'CASCADE',
                    delete_rule: 'CASCADE',
                    match_rule: 'NONE',
                },
            ],
        });

        await expect(tx.dropTable({ namespace: 'public', name: 'parent_tbl' })).to.be.rejected;
        await expect(tx.dropTable({ namespace: 'public', name: 'parent_tbl' }, { cascade: true })).to.not.be.rejected;

        const tables = tx.listTables({ namespace: 'public' });
        expect(tables).to.not.include('parent_tbl');
        expect(tables).to.include('child_tbl');
    });

    it('supports dropNamespace with ifExists', async () => {
        const tx = storageEngine.begin();
        await expect(tx.dropNamespace({ name: 'does_not_exist' }, { ifExists: true })).to.not.be.rejected;
    });

    it('supports dropTable with ifExists', async () => {
        const tx = storageEngine.begin();
        await expect(tx.dropTable({ namespace: 'public', name: 'does_not_exist' }, { ifExists: true })).to.not.be.rejected;
        await expect(tx.dropTable({ namespace: 'does_not_exist', name: 'tbl' }, { ifExists: true })).to.not.be.rejected;
    });

    it('supports showNamespace with ifExists', async () => {
        const tx = storageEngine.begin();
        expect(tx.showNamespace({ name: 'does_not_exist' }, { ifExists: true })).to.be.null;
    });

    it('supports showTable with ifExists', async () => {
        const tx = storageEngine.begin();
        expect(tx.showTable({ namespace: 'public', name: 'does_not_exist' }, { ifExists: true })).to.be.null;
        expect(tx.showTable({ namespace: 'does_not_exist', name: 'tbl' }, { ifExists: true })).to.be.null;
    });
});

describe('StorageEngine - Outsync', () => {
    it('retries failed outsync rows only after next_retry_at', async () => {
        let attempts = 0;
        let storageEngine;
        const upstreamClient = {
            wal: {
                async applyDownstreamCommit() {
                    attempts++;
                    if (attempts === 1) throw new Error('temporary upstream failure');
                    return true;
                },
                async subscribe() {
                    return async () => {};
                },
                async forget() {
                    return true;
                }
            },
            async query() {
                return { rows: [] };
            },
            live: {
                async forget() {
                    return true;
                }
            },
            get resolver() {
                return storageEngine.getResolver();
            },
        };

        storageEngine = await createEngine({
            autoSync: false,
            getUpstreamClient: async () => upstreamClient,
        });

        await storageEngine.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'src',
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                    { name: 'name', type: 'TEXT', not_null: true },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });

            await tx.createView({
                namespace: 'public',
                name: 'v_src',
                source_expr: 'TABLE public.src',
                replication_mode: 'materialized',
                replication_origin: 'flashql:primary',
            });
        });

        await storageEngine.transaction(async (tx) => {
            const view = tx.getRelation({ namespace: 'public', name: 'v_src' }, { assertIsView: true });
            await view.insert({ id: 1, name: 'Ada' });
        });

        await storageEngine.sync.sync({ public: 'v_src' });
        expect(attempts).to.eq(1);

        let queueRows = await storageEngine.transaction(async (tx) => {
            return tx.getRelation({ namespace: 'sys', name: 'sys_outsync_queue' }).getAll({ hiddenCols: true });
        });
        expect(queueRows).to.have.lengthOf(1);
        expect(queueRows[0].status).to.eq('failed');
        expect(queueRows[0].retry_count).to.eq(1);
        expect(queueRows[0].last_error).to.contain('temporary upstream failure');
        expect(queueRows[0].next_retry_at).to.be.a('number');

        await storageEngine.sync.sync({ public: 'v_src' });
        expect(attempts).to.eq(1);

        await storageEngine.sync.sync({ public: 'v_src' }, { forceSync: true });
        expect(attempts).to.eq(2);

        queueRows = await storageEngine.transaction(async (tx) => {
            return tx.getRelation({ namespace: 'sys', name: 'sys_outsync_queue' }).getAll({ hiddenCols: true });
        });
        expect(queueRows[0].status).to.eq('applied');
        expect(queueRows[0].next_retry_at).to.eq(null);
    });

    it('marks outsync conflicts without scheduling retry and emits conflict', async () => {
        let storageEngine;
        const upstreamClient = {
            wal: {
                async applyDownstreamCommit() {
                    throw new ConflictError('stale version');
                },
                async subscribe() {
                    return async () => {};
                },
                async forget() {
                    return true;
                }
            },
            async query() {
                return { rows: [] };
            },
            live: {
                async forget() {
                    return true;
                }
            },
            get resolver() {
                return storageEngine.getResolver();
            },
        };

        storageEngine = await createEngine({
            autoSync: false,
            getUpstreamClient: async () => upstreamClient,
        });

        await storageEngine.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'src',
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                    { name: 'name', type: 'TEXT', not_null: true },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });

            await tx.createView({
                namespace: 'public',
                name: 'v_src',
                source_expr: 'TABLE public.src',
                replication_mode: 'materialized',
                replication_origin: 'flashql:primary',
            });
        });

        await storageEngine.transaction(async (tx) => {
            const view = tx.getRelation({ namespace: 'public', name: 'v_src' }, { assertIsView: true });
            await view.insert({ id: 1, name: 'Ada' });
        });

        const emitted = { conflict: [], error: [] };
        const offConflict = storageEngine.sync.on('conflict', (payload) => emitted.conflict.push(payload));
        const offError = storageEngine.sync.on('error', (payload) => emitted.error.push(payload));

        await storageEngine.sync.sync({ public: 'v_src' });

        offConflict();
        offError();

        const queueRows = await storageEngine.transaction(async (tx) => {
            return tx.getRelation({ namespace: 'sys', name: 'sys_outsync_queue' }).getAll({ hiddenCols: true });
        });

        expect(queueRows).to.have.lengthOf(1);
        expect(queueRows[0].status).to.eq('conflicted');
        expect(queueRows[0].retry_count).to.eq(1);
        expect(queueRows[0].next_retry_at).to.eq(null);
        expect(queueRows[0].last_error).to.contain('stale version');

        expect(emitted.conflict).to.have.lengthOf(1);
        expect(emitted.conflict[0].phase).to.eq('outsync');
        expect(emitted.conflict[0].queue_status).to.eq('conflicted');
        expect(emitted.error).to.have.lengthOf(0);
    });
});

describe('StorageEngine - TableStorage CRUD And Constraints', () => {
    let storageEngine, tx, users;

    beforeEach(async () => {
        storageEngine = await createEngine();
        tx = storageEngine.begin();
        users = await createUsersTable(tx);
    });

    it('inserts with identity/default/generated expressions', async () => {
        const row = await users.insert({ fname: 'Hee' });

        expect(row.id).to.eq(1);
        expect(row.lname).to.eq('Doe');
        expect(row.full_name).to.eq('Hee Doe');
    });

    it('rejects invalid typed values', async () => {
        await expect(users.insert({ fname: 123 })).to.be.rejectedWith('expected TEXT');
    });

    it('supports common pg-like scalar types', async () => {
        await tx.createTable({
            namespace: 'public',
            name: 'pg_like_types',
            columns: [
                { name: 'id', type: 'INT', not_null: true },
                { name: 'small_v', type: 'SMALLINT' },
                { name: 'big_v', type: 'BIGINT' },
                { name: 'num_v', type: 'NUMERIC' },
                { name: 'real_v', type: 'REAL' },
                { name: 'dbl_v', type: 'DOUBLE PRECISION' },
                { name: 'txt_v', type: 'TEXT' },
                { name: 'varchar_v', type: 'VARCHAR' },
                { name: 'char_v', type: 'CHAR' },
                { name: 'bool_v', type: 'BOOLEAN' },
                { name: 'json_v', type: 'JSON' },
                { name: 'jsonb_v', type: 'JSONB' },
                { name: 'uuid_v', type: 'UUID' },
                { name: 'bytea_v', type: 'BYTEA' },
                { name: 'arr_v', type: 'ARRAY' },
                { name: 'date_v', type: 'DATE' },
                { name: 'time_v', type: 'TIME' },
                { name: 'ts_v', type: 'TIMESTAMP' },
                { name: 'tstz_v', type: 'TIMESTAMPTZ' },
                { name: 'interval_v', type: 'INTERVAL' },
            ],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });

        const tbl = tx.getRelation({ namespace: 'public', name: 'pg_like_types' });
        await tbl.insert({
            id: 1,
            small_v: 12,
            big_v: 1234567890,
            num_v: '1234.567',
            real_v: 1.5,
            dbl_v: 2.5,
            txt_v: 'text',
            varchar_v: 'v',
            char_v: 'c',
            bool_v: true,
            json_v: { a: 1 },
            jsonb_v: ['x', 2],
            uuid_v: '550e8400-e29b-41d4-a716-446655440000',
            bytea_v: new Uint8Array([1, 2, 3]),
            arr_v: [1, 'two', false],
            date_v: '2026-03-01',
            time_v: '11:22:33',
            ts_v: '2026-03-01 11:22:33',
            tstz_v: '2026-03-01T11:22:33Z',
            interval_v: '2 days 3 hours',
        });

        const row = tbl.get({ id: 1 });
        expect(row.uuid_v).to.eq('550e8400-e29b-41d4-a716-446655440000');
        expect(row.arr_v).to.deep.eq([1, 'two', false]);
        expect([...row.bytea_v]).to.deep.eq([1, 2, 3]);
    });

    it('accepts BIGINT values returned as strings and normalizes them', async () => {
        await tx.createTable({
            namespace: 'public',
            name: 'pg_bigint_strings',
            columns: [
                { name: 'id', type: 'INT', not_null: true },
                { name: 'big_v', type: 'BIGINT' },
            ],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });

        const tbl = tx.getRelation({ namespace: 'public', name: 'pg_bigint_strings' });
        await tbl.insert({ id: 1, big_v: '1234567890' });
        await tbl.insert({ id: 2, big_v: '9223372036854775807' });

        expect(tbl.get({ id: 1 }).big_v).to.eq(1234567890);
        expect(tbl.get({ id: 2 }).big_v).to.eq(9223372036854775807n);
    });

    it('rejects invalid values for common pg-like scalar types', async () => {
        await tx.createTable({
            namespace: 'public',
            name: 'pg_like_invalids',
            columns: [
                { name: 'id', type: 'INT', not_null: true },
                { name: 'small_v', type: 'SMALLINT' },
                { name: 'num_v', type: 'NUMERIC' },
                { name: 'uuid_v', type: 'UUID' },
                { name: 'bytea_v', type: 'BYTEA' },
                { name: 'arr_v', type: 'ARRAY' },
                { name: 'date_v', type: 'DATE' },
                { name: 'time_v', type: 'TIME' },
                { name: 'ts_v', type: 'TIMESTAMP' },
                { name: 'tstz_v', type: 'TIMESTAMPTZ' },
                { name: 'interval_v', type: 'INTERVAL' },
            ],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });

        const tbl = tx.getRelation({ namespace: 'public', name: 'pg_like_invalids' });

        await expect(tbl.insert({ id: 1, small_v: 50000 })).to.be.rejectedWith('expected SMALLINT');
        await expect(tbl.insert({ id: 2, num_v: 'not-a-number' })).to.be.rejectedWith('expected NUMERIC');
        await expect(tbl.insert({ id: 3, uuid_v: 'not-a-uuid' })).to.be.rejectedWith('expected UUID');
        await expect(tbl.insert({ id: 4, bytea_v: [1, 2, 3] })).to.be.rejectedWith('expected BYTEA');
        await expect(tbl.insert({ id: 5, arr_v: 'not-array' })).to.be.rejectedWith('expected ARRAY');
        await expect(tbl.insert({ id: 6, date_v: '2026/03/01' })).to.be.rejectedWith('expected DATE');
        await expect(tbl.insert({ id: 7, time_v: '11:22' })).to.be.rejectedWith('expected TIME');
        await expect(tbl.insert({ id: 8, ts_v: '2026-03-01' })).to.be.rejectedWith('expected TIMESTAMP');
        await expect(tbl.insert({ id: 9, tstz_v: '2026-03-01 11:22:33' })).to.be.rejectedWith('expected TIMESTAMPTZ');
        await expect(tbl.insert({ id: 10, interval_v: 'P2D' })).to.be.rejectedWith('expected INTERVAL');
    });

    it('enforces UNIQUE constraints', async () => {
        await users.insert({ fname: 'UniqueName' });
        await expect(users.insert({ fname: 'UniqueName' })).to.be.rejected;
    });

    it('enforces FK checks for missing parent', async () => {
        await expect(users.insert({ fname: 'Child', parent_id: 99999 })).to.be.rejected;
    });

    it('handles get/exists/getAll/count and index-based lookup', async () => {
        const r1 = await users.insert({ fname: 'One' });
        const r2 = await users.insert({ fname: 'Two', parent_id: r1.id });

        expect(users.exists({ id: r1.id })).to.be.true;
        expect(users.get({ id: r2.id }).fname).to.eq('Two');
        expect(users.count()).to.eq(2);

        const all = users.getAll();
        expect(all).to.have.length(2);
        expect(Object.keys(all[0])).to.deep.eq(['id', 'parent_id', 'fname', 'lname', 'full_name']);

        const fkIndex = [...users.schema.indexes.entries()].find(([, idx]) =>
            idx.kind === 'column' && idx.column_ids.some((c) => c.name === 'parent_id')
        )?.[0];
        expect(fkIndex).to.be.a('string');
        expect(users.get({ parent_id: r1.id }, { using: fkIndex, multiple: true })).to.have.length(1);
    });

    it('propagates FK CASCADE when PK updates', async () => {
        const parent = await users.insert({ fname: 'Parent' });
        const child = await users.insert({ fname: 'Child', parent_id: parent.id });

        const updatedParent = await users.update({ id: parent.id }, { id: 50, fname: 'Parent' });
        expect(updatedParent.id).to.eq(50);

        const reloadedChild = users.get({ id: child.id });
        expect(reloadedChild.parent_id).to.eq(50);
    });

    it('propagates FK CASCADE on delete', async () => {
        const parent = await users.insert({ fname: 'Parent2' });
        const child = await users.insert({ fname: 'Child2', parent_id: parent.id });

        await users.delete({ id: parent.id });

        expect(users.get({ id: child.id })).to.be.null;
    });

    it('supports truncate', async () => {
        await users.insert({ fname: 'A' });
        await users.insert({ fname: 'B' });

        const removed = await users.truncate();
        expect(removed).to.eq(2);
        expect(users.count()).to.eq(0);
    });

    it('rolls back uncommitted writes on abort', async () => {
        await users.insert({ fname: 'AbortMe' });
        await tx.rollback();

        const verifyTx = storageEngine.begin();
        expect(verifyTx.listTables({ namespace: 'public' })).to.not.include('users');
    });
});

describe('StorageEngine - FK Match Rules', () => {
    let storageEngine, tx;

    beforeEach(async () => {
        storageEngine = await createEngine();
        tx = storageEngine.begin();

        await tx.createTable({
            namespace: 'public',
            name: 'parents_comp',
            columns: [
                { name: 'a', type: 'INT', not_null: true },
                { name: 'b', type: 'INT', not_null: true },
            ],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['a', 'b'] }],
        });

        const parents = tx.getRelation({ namespace: 'public', name: 'parents_comp' });
        await parents.insert({ a: 1, b: 10 });
        await parents.insert({ a: 2, b: 20 });
    });

    it('MATCH FULL allows all-null and rejects partial-null inputs', async () => {
        await tx.createTable({
            namespace: 'public',
            name: 'children_full',
            columns: [
                { name: 'id', type: 'INT', not_null: true, is_generated: true, generation_rule: 'by_default' },
                { name: 'a', type: 'INT' },
                { name: 'b', type: 'INT' },
            ],
            constraints: [
                { kind: 'PRIMARY KEY', columns: ['id'] },
                {
                    kind: 'FOREIGN KEY',
                    columns: ['a', 'b'],
                    target_relation: 'parents_comp',
                    target_columns: ['a', 'b'],
                    match_rule: 'FULL',
                    update_rule: 'NO ACTION',
                    delete_rule: 'NO ACTION',
                },
            ],
        });

        const children = tx.getRelation({ namespace: 'public', name: 'children_full' });
        await expect(children.insert({ a: null, b: null })).to.not.be.rejected;
        await expect(children.insert({ a: 1, b: null })).to.be.rejected;
    });

    it('MATCH PARTIAL validates only provided non-null FK parts', async () => {
        await tx.createTable({
            namespace: 'public',
            name: 'children_partial',
            columns: [
                { name: 'id', type: 'INT', not_null: true, is_generated: true, generation_rule: 'by_default' },
                { name: 'a', type: 'INT' },
                { name: 'b', type: 'INT' },
            ],
            constraints: [
                { kind: 'PRIMARY KEY', columns: ['id'] },
                {
                    kind: 'FOREIGN KEY',
                    columns: ['a', 'b'],
                    target_relation: 'parents_comp',
                    target_columns: ['a', 'b'],
                    match_rule: 'PARTIAL',
                    update_rule: 'NO ACTION',
                    delete_rule: 'NO ACTION',
                },
            ],
        });

        const children = tx.getRelation({ namespace: 'public', name: 'children_partial' });
        await expect(children.insert({ a: 1, b: null })).to.not.be.rejected;
        await expect(children.insert({ a: 99, b: null })).to.be.rejected;
    });

    it('MATCH NONE skips FK validation when any part is null', async () => {
        await tx.createTable({
            namespace: 'public',
            name: 'children_none',
            columns: [
                { name: 'id', type: 'INT', not_null: true, is_generated: true, generation_rule: 'by_default' },
                { name: 'a', type: 'INT' },
                { name: 'b', type: 'INT' },
            ],
            constraints: [
                { kind: 'PRIMARY KEY', columns: ['id'] },
                {
                    kind: 'FOREIGN KEY',
                    columns: ['a', 'b'],
                    target_relation: 'parents_comp',
                    target_columns: ['a', 'b'],
                    match_rule: 'NONE',
                    update_rule: 'NO ACTION',
                    delete_rule: 'NO ACTION',
                },
            ],
        });

        const children = tx.getRelation({ namespace: 'public', name: 'children_none' });
        await expect(children.insert({ a: 999, b: null })).to.not.be.rejected;
    });
});

describe('StorageEngine - Replay And Visibility', () => {
    it('replays changefeed inserts/updates/deletes through tx.replay()', async () => {
        const storageEngine = await createEngine();

        const setupTx = storageEngine.begin();
        await setupTx.createTable({
            namespace: 'public',
            name: 'events',
            columns: [
                { name: 'id', type: 'INT', not_null: true },
                { name: 'title', type: 'TEXT', not_null: true },
            ],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });
        await setupTx.commit();

        const replayTx = storageEngine.begin();
        await replayTx.replay([
            {
                op: 'insert',
                relation: { namespace: 'public', name: 'events', keyColumns: ['id'] },
                new: { id: 1, title: 'A' },
            },
            {
                op: 'update',
                relation: { namespace: 'public', name: 'events', keyColumns: ['id'] },
                old: { id: 1, title: 'A' },
                new: { id: 1, title: 'B' },
            },
            {
                op: 'delete',
                relation: { namespace: 'public', name: 'events', keyColumns: ['id'] },
                old: { id: 1, title: 'B' },
            },
        ]);
        await replayTx.commit();

        const verifyTx = storageEngine.begin();
        const events = verifyTx.getRelation({ namespace: 'public', name: 'events' });
        expect(events.get(1)).to.be.null;
    });

    it('does not expose uncommitted writes across transactions', async () => {
        const storageEngine = await createEngine({ withTestTable: true });

        const tx1 = storageEngine.begin();
        const t1 = tx1.getRelation({ namespace: 'public', name: 'test' });
        await t1.insert({ id: 9991, name: 'InvisibleUntilCommit' });

        const tx2 = storageEngine.begin();
        const t2 = tx2.getRelation({ namespace: 'public', name: 'test' });
        expect(t2.get(9991)).to.be.null;

        await tx1.commit();

        const tx3 = storageEngine.begin();
        const t3 = tx3.getRelation({ namespace: 'public', name: 'test' });
        expect(t3.get(9991)).to.deep.include({ id: 9991, name: 'InvisibleUntilCommit' });
    });
});

describe('StorageEngine - Persistent WAL Integration', () => {
    it('replays persisted WAL and rehydrates sequences on init', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-test'], registry });

        const engine1 = await createEngine({ keyval });

        await engine1.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'persist_users',
                columns: [
                    { name: 'id', type: 'INT', not_null: true, is_generated: true, generation_rule: 'by_default' },
                    { name: 'name', type: 'TEXT', not_null: true },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });

        await engine1.transaction(async (tx) => {
            const users = tx.getRelation({ namespace: 'public', name: 'persist_users' });
            const r1 = await users.insert({ name: 'A' });
            const r2 = await users.insert({ name: 'B' });
            expect(r1.id).to.eq(1);
            expect(r2.id).to.eq(2);
        });

        const engine2 = await createEngine({ keyval: new InMemoryKV({ path: ['linkedql-test'], registry }) });

        const tx2 = engine2.begin();
        const users2 = tx2.getRelation({ namespace: 'public', name: 'persist_users' });
        const persisted = users2.getAll();
        expect(persisted.map((r) => r.name)).to.deep.eq(['A', 'B']);

        const r3 = await users2.insert({ name: 'C' });
        expect(r3.id).to.eq(3);
    });

    it('open({ versionStop }) replays to last matching table version by name', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-test-version-stop'], registry });

        const engine1 = await createEngine({ keyval });

        await engine1.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'versioned_tbl',
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });

        await engine1.transaction(async (tx) => {
            const t = tx.getRelation({ namespace: 'public', name: 'versioned_tbl' });
            await t.insert({ id: 1 });
        });

        await engine1.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'versioned_tbl' }, { name: 'versioned_tbl_v2' });
        });

        await engine1.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'versioned_tbl_v2' }, { name: 'versioned_tbl' });
        });

        await engine1.transaction(async (tx) => {
            const t = tx.getRelation({ namespace: 'public', name: 'versioned_tbl' });
            await t.insert({ id: 2 });
        });

        const engine2 = new StorageEngine({ keyval: new InMemoryKV({ path: ['linkedql-test-version-stop'], registry }) });
        await engine2.open({ versionStop: 'public.versioned_tbl@=1' });

        const tx2 = engine2.begin();
        const t2 = tx2.getRelation({ namespace: 'public', name: 'versioned_tbl', versionSpec: '=1' });
        expect(t2.getAll().map((r) => r.id)).to.deep.eq([1]);
        expect(() => tx2.getRelation({ namespace: 'public', name: 'versioned_tbl', versionSpec: '>=2' })).to.throw();
    });

    it('open({ versionStop }) throws when replay completes without a match', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-test-version-stop-no-match'], registry });

        const engine1 = await createEngine({ keyval });

        await engine1.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'no_match_tbl',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });

        const engine2 = new StorageEngine({ keyval: new InMemoryKV({ path: ['linkedql-test-version-stop-no-match'], registry }) });
        await expect(engine2.open({ versionStop: 'public.no_match_tbl@>=5' })).to.be.rejectedWith('No table version matched');
    });

    it('open({ versionStop: string }) requires explicit namespace qualification', async () => {
        const storageEngine = new StorageEngine();
        await expect(storageEngine.open({ versionStop: 'users@1' })).to.be.rejectedWith('include namespace qualification');
    });

    it('open({ overwriteForward: true }) requires versionStop', async () => {
        const storageEngine = new StorageEngine();
        await expect(storageEngine.open({ overwriteForward: true })).to.be.rejectedWith('requires versionStop');
    });

    it('readOnly engine rejects open({ overwriteForward: true })', async () => {
        const storageEngine = new StorageEngine({ readOnly: true });
        await expect(storageEngine.open({
            versionStop: 'public.test@1',
            overwriteForward: true,
        })).to.be.rejectedWith('configured readOnly');
    });

    it('StorageEngine.open({ versionStop }) read-only snapshot rejects writes', async () => {
        const registry = new Map();
        const sourceKeyval = new InMemoryKV({ path: ['linkedql-openat-ro-src'], registry });

        const source = await createEngine({ keyval: sourceKeyval });
        await source.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'openat_ro_tbl',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });
        await source.close({ destroy: false });

        const snapshot = new StorageEngine({ keyval: new InMemoryKV({ path: ['linkedql-openat-ro-src'], registry }) });
        await snapshot.open({ versionStop: 'public.openat_ro_tbl@1' });

        const tx = snapshot.begin();
        const t = tx.getRelation({ namespace: 'public', name: 'openat_ro_tbl' });
        await expect(t.insert({ id: 1 })).to.be.rejectedWith('read-only');
        await snapshot.close();
    });

    it('StorageEngine.open({ versionStop, overwriteForward }) truncates only on first mutating commit', async () => {
        const registry = new Map();
        const sourcePath = ['linkedql-openat-overwrite-src'];
        const sourceKv = new InMemoryKV({ path: sourcePath, registry });

        const source = await createEngine({ keyval: sourceKv });
        await source.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'overwrite_tbl',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });
        await source.transaction(async (tx) => {
            const t = tx.getRelation({ namespace: 'public', name: 'overwrite_tbl' });
            await t.insert({ id: 1 });
        });
        await source.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'overwrite_tbl' }, { name: 'overwrite_tbl_tmp' });
        });
        await source.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'overwrite_tbl_tmp' }, { name: 'overwrite_tbl' });
        });
        await source.transaction(async (tx) => {
            const t = tx.getRelation({ namespace: 'public', name: 'overwrite_tbl' });
            await t.insert({ id: 2 });
        });
        await source.close();

        const overwritten = new StorageEngine({ keyval: new InMemoryKV({ path: sourcePath, registry }) });
        await overwritten.open({
            versionStop: 'public.overwrite_tbl@1',
            overwriteForward: true,
        });

        const beforeMutation = await createEngine({ keyval: new InMemoryKV({ path: sourcePath, registry }) });
        const beforeTx = beforeMutation.begin();
        expect(beforeTx.getRelation({ namespace: 'public', name: 'overwrite_tbl' }).getAll().map((r) => r.id)).to.deep.eq([1, 2]);
        await beforeMutation.close({ destroy: false });

        await overwritten.transaction(async (tx) => {
            const t = tx.getRelation({ namespace: 'public', name: 'overwrite_tbl' });
            await t.insert({ id: 3 });
        });
        await overwritten.close({ destroy: false });

        const verify = await createEngine({ keyval: new InMemoryKV({ path: sourcePath, registry }) });
        const tx = verify.begin();
        expect(tx.getRelation({ namespace: 'public', name: 'overwrite_tbl' }).getAll().map((r) => r.id)).to.deep.eq([1, 3]);
        await verify.close();
    });
});

describe('StorageEngine - Session Config', () => {
    it('sets and gets string and array values', async () => {
        const storageEngine = await createEngine();

        storageEngine.setSessionConfig('search_path', ['public', 'x']);
        expect(storageEngine.getSessionConfig('search_path')).to.deep.eq(['public', 'x']);

        storageEngine.setSessionConfig('application_name', 'linkedql');
        expect(storageEngine.getSessionConfig('application_name')).to.eq('linkedql');
    });

    it('rolls back config change on tx abort', async () => {
        const storageEngine = await createEngine();
        storageEngine.setSessionConfig('search_path', ['public']);

        const tx = storageEngine.begin();
        storageEngine.setSessionConfig('search_path', ['temp_schema'], tx);
        await tx.rollback();

        expect(storageEngine.getSessionConfig('search_path')).to.deep.eq(['public']);
    });

    it('rejects non-string config values', async () => {
        const storageEngine = await createEngine();
        expect(() => storageEngine.setSessionConfig('search_path', [123])).to.throw();
    });
});

describe('StorageEngine - Error And Validation Paths', () => {
    it('throws for unknown replay op', async () => {
        const storageEngine = await createEngine({ withTestTable: true });
        const tx = storageEngine.begin();

        await expect(tx.replay([
            { op: 'upsert', relation: { namespace: 'public', name: 'test' }, new: { id: 1, name: 'X' } }
        ])).to.be.rejectedWith('Unknown op type');
    });

    it('tx.getRelation() enforces versionSpec and respects ifExists on mismatch', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();

        await tx.createTable({
            namespace: 'public',
            name: 'version_gate_tbl',
            columns: [{ name: 'id', type: 'INT', not_null: true }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });

        expect(() => tx.getRelation({ namespace: 'public', name: 'version_gate_tbl', versionSpec: '>=2' })).to.throw('does not satisfy');
        expect(tx.showTable(
            { namespace: 'public', name: 'version_gate_tbl', versionSpec: '>=2' },
            { ifExists: true }
        )).to.be.null;
    });

    it('rejects createTable on invalid namespace/kind/persistence', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();

        await expect(tx.createTable({
            namespace: 'nonexistent',
            name: 'tbl',
            columns: [{ name: 'id', type: 'INT' }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        })).to.be.rejectedWith('Namespace "nonexistent" does not exist');

        await expect(tx.createTable({
            namespace: 'public',
            name: 'bad_kind',
            kind: 'materialized_view',
            columns: [{ name: 'id', type: 'INT' }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        })).to.be.rejectedWith('Unexpected inputs: kind');

        await expect(tx.createTable({
            namespace: 'public',
            name: 'bad_persistence',
            persistence: 'durable',
            columns: [{ name: 'id', type: 'INT' }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        })).to.be.rejectedWith('Invalid persistence setting');
    });

    it('rejects createIndex on invalid table', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();

        await expect(tx.createIndex({
            namespace: 'public',
            table: 'missing_tbl',
            name: 'missing_idx',
            method: 'hash',
            is_unique: false,
            kind: 'column',
            columns: ['id'],
        })).to.be.rejectedWith('Relation "public"."missing_tbl" does not exist');
    });
});

describe('StorageEngine - FK Action Rules', () => {
    let storageEngine, tx;

    const setupParentChild = async (rules) => {
        await tx.createTable({
            namespace: 'public',
            name: 'parent_fk',
            columns: [{ name: 'id', type: 'INT', not_null: true }],
            constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
        });

        await tx.createTable({
            namespace: 'public',
            name: 'child_fk',
            columns: [
                { name: 'id', type: 'INT', not_null: true },
                { name: 'parent_id', type: 'INT', default_expr: '777' },
            ],
            constraints: [
                { kind: 'PRIMARY KEY', columns: ['id'] },
                {
                    kind: 'FOREIGN KEY',
                    columns: ['parent_id'],
                    target_relation: 'parent_fk',
                    target_columns: ['id'],
                    match_rule: 'NONE',
                    ...rules,
                },
            ],
        });

        const parent = tx.getRelation({ namespace: 'public', name: 'parent_fk' });
        const child = tx.getRelation({ namespace: 'public', name: 'child_fk' });
        await parent.insert({ id: 1 });
        await parent.insert({ id: 777 });
        await child.insert({ id: 10, parent_id: 1 });
        return { parent, child };
    };

    beforeEach(async () => {
        storageEngine = await createEngine();
        tx = storageEngine.begin();
    });

    it('RESTRICT fails immediately on parent delete', async () => {
        const { parent } = await setupParentChild({ update_rule: 'RESTRICT', delete_rule: 'RESTRICT' });
        await expect(parent.delete({ id: 1 })).to.be.rejected;
    });

    it('NO ACTION fails at commit time', async () => {
        const { parent } = await setupParentChild({ update_rule: 'NO ACTION', delete_rule: 'NO ACTION' });
        await expect(parent.delete({ id: 1 })).to.not.be.rejected;
        await expect(tx.commit()).to.be.rejected;
    });

    it('SET NULL nullifies child refs on delete', async () => {
        const { parent, child } = await setupParentChild({ update_rule: 'SET NULL', delete_rule: 'SET NULL' });
        await parent.delete({ id: 1 });
        expect(child.get({ id: 10 }).parent_id).to.be.null;
    });

    it('SET DEFAULT applies defaults on delete', async () => {
        const { parent, child } = await setupParentChild({ update_rule: 'SET DEFAULT', delete_rule: 'SET DEFAULT' });
        await parent.delete({ id: 1 });
        expect(child.get({ id: 10 }).parent_id).to.eq(777);
    });
});

describe('StorageEngine - Column Validation Matrix', () => {
    const invalidColumnCases = [
        { title: 'rejects missing column name', columns: [{ type: 'INT' }] },
        { title: 'rejects invalid column name', columns: [{ name: '1id', type: 'INT' }] },
        { title: 'rejects missing type and type_id', columns: [{ name: 'id' }] },
        { title: 'rejects both type and type_id', columns: [{ name: 'id', type: 'INT', type_id: 11 }] },
        { title: 'rejects unknown type', columns: [{ name: 'id', type: 'UNKNOWN_TYPE' }] },
        { title: 'rejects non-string/number default_expr', columns: [{ name: 'id', type: 'INT', default_expr: [123] }] },
        { title: 'rejects default_expr with default_expr_ast together', columns: [{ name: 'id', type: 'INT', default_expr: '1', default_expr_ast: { nodeName: 'NUM' } }] },
        { title: 'rejects generation_expr on non-generated column', columns: [{ name: 'id', type: 'INT', generation_expr: '1 + 1' }] },
        { title: 'rejects non-string/number generation_expr', columns: [{ name: 'id', type: 'INT', is_generated: true, generation_expr: [55] }] },
        { title: 'rejects generation_expr and generation_expr_ast together', columns: [{ name: 'id', type: 'INT', is_generated: true, generation_expr: '1 + 1', generation_expr_ast: { nodeName: 'NUM' } }] },
        { title: 'rejects invalid generation_expr_ast object', columns: [{ name: 'id', type: 'INT', is_generated: true, generation_expr_ast: {} }] },
        { title: 'rejects invalid default_expr_ast object', columns: [{ name: 'id', type: 'INT', default_expr_ast: {} }] },
        { title: 'rejects invalid identity generation_rule', columns: [{ name: 'id', type: 'INT', is_generated: true, generation_rule: 'sometimes' }] },
        { title: 'rejects invalid generation_rule with generation expression', columns: [{ name: 'id', type: 'INT', is_generated: true, generation_expr: '1 + 1', generation_rule: 'by_default' }] },
    ];

    invalidColumnCases.forEach(({ title, columns }) => {
        it(title, async () => {
            const storageEngine = await createEngine();
            const tx = storageEngine.begin();

            await expect(tx.createTable({
                namespace: 'public',
                name: 'col_validation_tbl',
                columns,
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            })).to.be.rejected;
        });
    });
});

describe('StorageEngine - Constraint Validation Matrix', () => {
    const invalidConstraintCases = [
        { title: 'rejects unknown constraint kind', constraints: [{ kind: 'WHATEVER', columns: ['id'] }] },
        { title: 'rejects CHECK with columns', constraints: [{ kind: 'CHECK', columns: ['id'], expression: 'id > 0' }] },
        { title: 'rejects CHECK without expression', constraints: [{ kind: 'CHECK' }] },
        { title: 'rejects non-string CHECK expression', constraints: [{ kind: 'CHECK', expression: 1 }] },
        { title: 'rejects expression on non-CHECK', constraints: [{ kind: 'UNIQUE', columns: ['id'], expression: 'id > 0' }] },
        { title: 'rejects FK without target relation', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_columns: ['id'] }] },
        { title: 'rejects FK target_relation non-string', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 1, target_columns: ['id'] }] },
        { title: 'rejects FK target_columns non-array', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: 'id' }] },
        { title: 'rejects FK with unknown target relation', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'missing_tbl', target_columns: ['id'] }] },
        { title: 'rejects FK with unknown target column', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: ['missing_col'] }] },
        { title: 'rejects FK with invalid match_rule', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: ['id'], match_rule: 'SIMPLE' }] },
        { title: 'rejects FK with invalid update_rule', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: ['id'], update_rule: 'MERGE' }] },
        { title: 'rejects FK with invalid delete_rule', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: ['id'], delete_rule: 'KEEP' }] },
        { title: 'rejects FK with both match_rule and fk_match_rule', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: ['id'], match_rule: 'FULL', fk_match_rule: 'NONE' }] },
        { title: 'rejects FK with both update_rule and fk_update_rule', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: ['id'], update_rule: 'CASCADE', fk_update_rule: 'NO ACTION' }] },
        { title: 'rejects FK with both delete_rule and fk_delete_rule', constraints: [{ kind: 'FOREIGN KEY', columns: ['id'], target_relation: 'base_tbl', target_columns: ['id'], delete_rule: 'CASCADE', fk_delete_rule: 'NO ACTION' }] },
        { title: 'rejects UNIQUE with unknown column', constraints: [{ kind: 'UNIQUE', columns: ['missing_col'] }] },
        { title: 'rejects non-array columns value', constraints: [{ kind: 'UNIQUE', columns: 'id' }] },
        { title: 'rejects columns and column_ids together', constraints: [{ kind: 'UNIQUE', columns: ['id'], column_ids: [1] }] },
        { title: 'rejects non-string constraint name', constraints: [{ kind: 'UNIQUE', name: 123, columns: ['id'] }] },
    ];

    invalidConstraintCases.forEach(({ title, constraints }) => {
        it(title, async () => {
            const storageEngine = await createEngine();
            const tx = storageEngine.begin();

            await tx.createTable({
                namespace: 'public',
                name: 'base_tbl',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });

            await expect(tx.createTable({
                namespace: 'public',
                name: 'con_validation_tbl',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }, ...constraints],
            })).to.be.rejected;
        });
    });
});

describe('StorageEngine - Index Validation Matrix', () => {
    const invalidIndexCases = [
        { title: 'rejects unknown index kind', index: { name: 'idx1', method: 'hash', is_unique: false, kind: 'mystery', columns: ['name'] } },
        { title: 'rejects unsupported index method', index: { name: 'idx2', method: 'btree', is_unique: false, kind: 'column', columns: ['name'] } },
        { title: 'rejects non-array columns on column index', index: { name: 'idx3', method: 'hash', is_unique: false, kind: 'column', columns: 'name' } },
        { title: 'rejects unknown column in index', index: { name: 'idx4', method: 'hash', is_unique: false, kind: 'column', columns: ['missing_col'] } },
        { title: 'rejects expression index without expression', index: { name: 'idx5', method: 'hash', is_unique: false, kind: 'expression' } },
        { title: 'rejects expression index with columns', index: { name: 'idx6', method: 'hash', is_unique: false, kind: 'expression', columns: ['name'], expression: 'name' } },
        { title: 'rejects non-string expression', index: { name: 'idx7', method: 'hash', is_unique: false, kind: 'expression', expression: [100] } },
        { title: 'rejects expression on column index', index: { name: 'idx8', method: 'hash', is_unique: false, kind: 'column', columns: ['name'], expression: 'name' } },
        { title: 'rejects expression and expression_ast together', index: { name: 'idx9', method: 'hash', is_unique: false, kind: 'expression', expression: 'name', expression_ast: { nodeName: 'IDENT' } } },
        { title: 'rejects columns and column_ids together', index: { name: 'idx10', method: 'hash', is_unique: false, kind: 'column', columns: ['name'], column_ids: [1] } },
        { title: 'rejects non-array column_ids', index: { name: 'idx11', method: 'hash', is_unique: false, kind: 'column', column_ids: 1 } },
        { title: 'rejects unknown column_id', index: { name: 'idx12', method: 'hash', is_unique: false, kind: 'column', column_ids: [999999] } },
    ];

    invalidIndexCases.forEach(({ title, index }) => {
        it(title, async () => {
            const storageEngine = await createEngine();
            const tx = storageEngine.begin();

            await tx.createTable({
                namespace: 'public',
                name: 'idx_base',
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                    { name: 'name', type: 'TEXT' },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });

            await expect(tx.createIndex({
                namespace: 'public',
                table: 'idx_base',
                ...index,
            })).to.be.rejected;
        });
    });
});

describe('StorageEngine - Read Write Nuances', () => {
    let storageEngine, tx, users;

    beforeEach(async () => {
        storageEngine = await createEngine();
        tx = storageEngine.begin();
        users = await createUsersTable(tx, { tableName: 'rw_users' });
    });

    it('get() returns cloned rows', async () => {
        const row = await users.insert({ fname: 'CloneA' });
        const r1 = users.get(row.id);
        r1.fname = 'Mutated';
        const r2 = users.get(row.id);
        expect(r2.fname).to.eq('CloneA');
    });

    it('getAll() returns cloned rows', async () => {
        await users.insert({ fname: 'CloneAll' });
        const all1 = users.getAll();
        all1[0].fname = 'Mutated';
        const all2 = users.getAll();
        expect(all2[0].fname).to.eq('CloneAll');
    });

    it('exists() returns false for missing row', () => {
        expect(users.exists(999999)).to.be.false;
    });

    it('supports scalar, object, and array key forms', async () => {
        const row = await users.insert({ fname: 'KeyForms' });
        expect(users.get(row.id).id).to.eq(row.id);
        expect(users.get({ id: row.id }).id).to.eq(row.id);
        expect(users.get([row.id]).id).to.eq(row.id);
    });

    it('rejects malformed key arrays', () => {
        expect(() => users.get([1, 2])).to.throw();
    });

    it('rejects invalid index name in get', () => {
        expect(() => users.get({ fname: 'X' }, { using: 'missing_idx' })).to.throw();
    });

    it('rejects invalid index name in getAll', () => {
        expect(() => users.getAll({ using: 'missing_idx' })).to.throw();
    });

    it('update returns null for missing row', async () => {
        await expect(await users.update({ id: 404 }, { id: 404, fname: 'X' })).to.be.null;
    });

    it('delete returns null for missing row', async () => {
        await expect(await users.delete({ id: 404 })).to.be.null;
    });

    it('truncate on empty table returns 0', async () => {
        const removed = await users.truncate();
        expect(removed).to.eq(0);
    });

    it('count reflects delete operations', async () => {
        const row = await users.insert({ fname: 'CountDel' });
        expect(users.count()).to.eq(1);
        await users.delete(row.id);
        expect(users.count()).to.eq(0);
    });

    it('update rejects duplicate target PK', async () => {
        const r1 = await users.insert({ fname: 'Dup1' });
        const r2 = await users.insert({ fname: 'Dup2' });
        await expect(users.update(r2.id, { id: r1.id, fname: 'Dup2' })).to.be.rejected;
    });

    it('update preserves unchanged values when partial row is provided', async () => {
        const row = await users.insert({ fname: 'Partial', lname: 'Before' });
        const updated = await users.update(row.id, { id: row.id, fname: 'After' });
        expect(updated.lname).to.eq('Before');
    });

    it('supports get(multiple) via non-unique index', async () => {
        const fkIndex = [...users.schema.indexes.entries()].find(([, idx]) =>
            idx.kind === 'column' && idx.column_ids.some((c) => c.name === 'parent_id')
        )?.[0];
        const p = await users.insert({ fname: 'ParentNU' });
        await users.insert({ fname: 'ChildNU1', parent_id: p.id });
        await users.insert({ fname: 'ChildNU2', parent_id: p.id });
        const found = users.get({ parent_id: p.id }, { using: fkIndex, multiple: true });
        expect(found).to.have.length(2);
    });

    it('exists(using index) works with unique index', async () => {
        await users.insert({ fname: 'ExistsIdx' });
        expect(users.exists({ fname: 'ExistsIdx' }, { using: 'rw_users__fname_idx' })).to.be.true;
    });
});

describe('StorageEngine - MVCC And Transaction Metadata', () => {
    it('rejects unknown strategy specifier', async () => {
        const storageEngine = await createEngine();
        expect(() => storageEngine.begin({ strategySpec: 'unknown' })).to.throw();
    });

    it('tracks tx meta as active on begin', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();
        expect(storageEngine.txMeta(tx.id).state).to.eq('active');
    });

    it('tracks tx meta as committed and sets commitTime', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();
        await tx.commit();
        const meta = storageEngine.txMeta(tx.id);
        expect(meta.state).to.eq('committed');
        expect(meta.commitTime).to.be.a('number');
    });

    it('tracks tx meta as aborted', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();
        await tx.rollback();
        expect(storageEngine.txMeta(tx.id).state).to.eq('aborted');
    });

    it('commitCounter increases on successful commits', async () => {
        const storageEngine = await createEngine();
        const before = storageEngine.commitCounter;
        const tx = storageEngine.begin();
        await tx.commit();
        expect(storageEngine.commitCounter).to.eq(before + 1);
    });

    it('snapshot equals current commitCounter at begin time', async () => {
        const storageEngine = await createEngine();
        const tx1 = storageEngine.begin();
        await tx1.commit();
        const tx2 = storageEngine.begin();
        expect(tx2.snapshot).to.eq(storageEngine.commitCounter);
    });

    it('getOldestActiveSnapshot returns oldest snapshot among active txs', async () => {
        const storageEngine = await createEngine();
        const t1 = storageEngine.begin();
        const t2 = storageEngine.begin();
        expect(storageEngine.getOldestActiveSnapshot()).to.eq(Math.min(t1.snapshot, t2.snapshot));
    });

    it('getOldestActiveSnapshot falls back to commitCounter when no active tx', async () => {
        const storageEngine = await createEngine();
        const t1 = storageEngine.begin();
        await t1.commit();
        expect(storageEngine.getOldestActiveSnapshot()).to.eq(storageEngine.commitCounter);
    });

    it('second commit attempt fails with invalid state', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();
        await tx.commit();
        await expect(tx.rollback()).to.be.rejectedWith(/Invalid transaction state/);
    });

    it('commit/abort are idempotent for already committed/aborted tx', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();
        await tx.rollback();
        await expect(tx.rollback()).to.not.be.rejected;
    });
});

describe('StorageEngine - Persistence Metadata Nuances', () => {
    it('creates WAL head after first persisted commit', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-meta-1'], registry });
        const storageEngine = await createEngine({ keyval });

        const metaKV = keyval.enter(['meta']);
        expect(await metaKV.get('latestCommit')).to.be.a('number');
    });

    it('stores WAL payload with sequenceHeads and changes', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-meta-2'], registry });
        const storageEngine = await createEngine({ keyval });

        await storageEngine.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'wal_payload_tbl',
                columns: [{ name: 'id', type: 'INT', is_generated: true, generation_rule: 'by_default' }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
            const tbl = tx.getRelation({ namespace: 'public', name: 'wal_payload_tbl' });
            await tbl.insert({});
        });

        const metaKV = keyval.enter(['meta']);
        const commitsKV = keyval.enter(['commits']);
        const head = await metaKV.get('latestCommit');
        const payload = await commitsKV.get(head);
        expect(payload).to.have.property('sequenceHeads');
        expect(payload).to.have.property('entries');
        expect(payload.entries.length).to.be.greaterThan(0);
    });

    it('bootstraps defaults when keyval exists but has no wal_head', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-meta-3'], registry });
        const storageEngine = await createEngine({ keyval, withTestTable: true });

        const tx = storageEngine.begin();
        expect(tx.listTables({ namespace: 'public' })).to.include('test');
    });

    it('constructor requires keyval.enter contract when keyval is provided', async () => {
        expect(() => new StorageEngine({ keyval: {} })).to.throw();
    });
});

describe('StorageEngine - MVCC Strategy Interop', () => {
    const setup = async () => {
        const storageEngine = await createEngine();

        await storageEngine.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'mvcc_case',
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                    { name: 'name', type: 'TEXT', not_null: true },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });

            const table = tx.getRelation({ namespace: 'public', name: 'mvcc_case' });
            await table.insert({ id: 1, name: 'row1' });
            await table.insert({ id: 2, name: 'row2' });
        });

        return storageEngine;
    };

    it('FUW + FUW: second writer conflicts eagerly on same row', async () => {
        const storageEngine = await setup();
        const tx1 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const tx2 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const t1 = tx1.getRelation({ namespace: 'public', name: 'mvcc_case' });
        const t2 = tx2.getRelation({ namespace: 'public', name: 'mvcc_case' });

        await expect(t1.update(1, { id: 1, name: 'tx1' })).to.not.be.rejected;
        await expect(t2.update(1, { id: 1, name: 'tx2' })).to.be.rejectedWith('Write conflict');
    });

    it('FUW + FUW: concurrent writes on different rows both succeed', async () => {
        const storageEngine = await setup();
        const tx1 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const tx2 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const t1 = tx1.getRelation({ namespace: 'public', name: 'mvcc_case' });
        const t2 = tx2.getRelation({ namespace: 'public', name: 'mvcc_case' });

        await expect(t1.update(1, { id: 1, name: 'tx1' })).to.not.be.rejected;
        await expect(t2.update(2, { id: 2, name: 'tx2' })).to.not.be.rejected;
        await expect(tx1.commit()).to.not.be.rejected;
        await expect(tx2.commit()).to.not.be.rejected;
    });

    it('FCW + FCW: both writes can proceed; second commit loses', async () => {
        const storageEngine = await setup();
        const tx1 = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const tx2 = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const t1 = tx1.getRelation({ namespace: 'public', name: 'mvcc_case' });
        const t2 = tx2.getRelation({ namespace: 'public', name: 'mvcc_case' });

        await expect(t1.update(1, { id: 1, name: 'tx1' })).to.not.be.rejected;
        await expect(t2.update(1, { id: 1, name: 'tx2' })).to.not.be.rejected;

        await expect(tx1.commit()).to.not.be.rejected;
        await expect(tx2.commit()).to.be.rejectedWith('Commit-time write conflict');
    });

    it('FCW + FCW: read conflict at commit time after concurrent committed write', async () => {
        const storageEngine = await setup();
        const txReader = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const txWriter = storageEngine.begin({ strategySpec: 'first_committer_wins' });

        const readerTable = txReader.getRelation({ namespace: 'public', name: 'mvcc_case' });
        const writerTable = txWriter.getRelation({ namespace: 'public', name: 'mvcc_case' });

        expect(readerTable.get(1).name).to.eq('row1'); // registers read set
        await writerTable.update(1, { id: 1, name: 'writer' });
        await txWriter.commit();

        await expect(txReader.commit()).to.be.rejectedWith('Commit-time read conflict');
    });

    it('FUW + FCW: second writer conflicts eagerly on same row', async () => {
        const storageEngine = await setup();
        const txFUW = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const txFCW = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const tFUW = txFUW.getRelation({ namespace: 'public', name: 'mvcc_case' });
        const tFCW = txFCW.getRelation({ namespace: 'public', name: 'mvcc_case' });

        await expect(tFUW.update(1, { id: 1, name: 'fuw' })).to.not.be.rejected;
        await expect(tFCW.update(1, { id: 1, name: 'fcw' })).to.be.rejectedWith('Write conflict');
    });

    it('FCW + FUW: second writer conflicts eagerly on same row', async () => {
        const storageEngine = await setup();
        const txFCW = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const txFUW = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const tFCW = txFCW.getRelation({ namespace: 'public', name: 'mvcc_case' });
        const tFUW = txFUW.getRelation({ namespace: 'public', name: 'mvcc_case' });

        await expect(tFCW.update(1, { id: 1, name: 'fcw' })).to.not.be.rejected;
        await expect(tFUW.update(1, { id: 1, name: 'fuw' })).to.be.rejectedWith('Write conflict');
    });
});

describe('StorageEngine - Serializable Strategy', () => {
    const setup = async () => {
        const storageEngine = await createEngine();
        await storageEngine.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'ser_case',
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                    { name: 'name', type: 'TEXT', not_null: true },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
            const t = tx.getRelation({ namespace: 'public', name: 'ser_case' });
            await t.insert({ id: 1, name: 'A' });
        });
        return storageEngine;
    };

    it('supports serializable strategy begin()', async () => {
        const storageEngine = await setup();
        const tx = storageEngine.begin({ strategySpec: 'serializable' });
        expect(storageEngine.txMeta(tx.id).strategy).to.eq('serializable');
    });

    it('serializable write-write conflict resolves at commit time', async () => {
        const storageEngine = await setup();
        const tx1 = storageEngine.begin({ strategySpec: 'serializable' });
        const tx2 = storageEngine.begin({ strategySpec: 'serializable' });
        const t1 = tx1.getRelation({ namespace: 'public', name: 'ser_case' });
        const t2 = tx2.getRelation({ namespace: 'public', name: 'ser_case' });

        await t1.update(1, { id: 1, name: 'X1' });
        await t2.update(1, { id: 1, name: 'X2' });

        await expect(tx1.commit()).to.not.be.rejected;
        await expect(tx2.commit()).to.be.rejectedWith('Commit-time write conflict');
    });

    it('serializable read conflict is detected at commit time', async () => {
        const storageEngine = await setup();
        const txReader = storageEngine.begin({ strategySpec: 'serializable' });
        const txWriter = storageEngine.begin({ strategySpec: 'serializable' });
        const tr = txReader.getRelation({ namespace: 'public', name: 'ser_case' });
        const tw = txWriter.getRelation({ namespace: 'public', name: 'ser_case' });

        expect(tr.get(1).name).to.eq('A');
        await tw.update(1, { id: 1, name: 'B' });
        await txWriter.commit();

        await expect(txReader.commit()).to.be.rejectedWith('Commit-time read conflict');
    });

    it('serializable detects phantom conflict on full scan', async () => {
        const storageEngine = await setup();
        const txScan = storageEngine.begin({ strategySpec: 'serializable' });
        const txInsert = storageEngine.begin({ strategySpec: 'serializable' });
        const ts = txScan.getRelation({ namespace: 'public', name: 'ser_case' });
        const ti = txInsert.getRelation({ namespace: 'public', name: 'ser_case' });

        const baseline = ts.getAll();
        expect(baseline).to.have.length(1);

        await ti.insert({ id: 2, name: 'P' });
        await txInsert.commit();

        await expect(txScan.commit()).to.be.rejectedWith('Serializable phantom conflict');
    });

    it('serializable does not flag phantom when unrelated table changes', async () => {
        const storageEngine = await setup();

        await storageEngine.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'ser_other',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });

        const txScan = storageEngine.begin({ strategySpec: 'serializable' });
        const txOther = storageEngine.begin({ strategySpec: 'serializable' });
        const ts = txScan.getRelation({ namespace: 'public', name: 'ser_case' });
        const to = txOther.getRelation({ namespace: 'public', name: 'ser_other' });

        ts.getAll();
        await to.insert({ id: 10 });
        await txOther.commit();

        await expect(txScan.commit()).to.not.be.rejected;
    });
});
