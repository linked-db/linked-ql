import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { StorageEngine } from '../src/flashql/storage/StorageEngine.js';
import { TableStorage } from '../src/flashql/storage/TableStorage.js';
import { InMemoryKV } from '@webqit/keyval/inmemory';

const createEngine = async () => {
    const storageEngine = new StorageEngine();
    await storageEngine.init();
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

    return tx.getTable({ namespace: 'public', name: tableName });
};

describe('StorageEngine - Bootstrapping And Transactions', () => {
    it('bootstraps userspace catalog and default table', async () => {
        const storageEngine = await createEngine();

        const tx = storageEngine.begin();
        expect(tx.listNamespaces()).to.include('public');
        expect(tx.listTables({ namespace: 'public' })).to.include('test');

        const table = tx.getTable({ namespace: 'public', name: 'test' });
        expect(table).to.be.instanceOf(TableStorage);
    });

    it('commits via transaction() helper', async () => {
        const storageEngine = await createEngine();

        await storageEngine.transaction(async (tx) => {
            const table = tx.getTable({ namespace: 'public', name: 'test' });
            await table.insert({ id: 7001, name: 'Committed' });
        });

        const tx = storageEngine.begin();
        const table = tx.getTable({ namespace: 'public', name: 'test' });
        expect(table.get(7001)).to.deep.include({ id: 7001, name: 'Committed' });
    });

    it('aborts via transaction() helper on throw', async () => {
        const storageEngine = await createEngine();

        await expect(storageEngine.transaction(async (tx) => {
            const table = tx.getTable({ namespace: 'public', name: 'test' });
            await table.insert({ id: 7002, name: 'RolledBack' });
            throw new Error('force rollback');
        })).to.be.rejectedWith('force rollback');

        const tx = storageEngine.begin();
        const table = tx.getTable({ namespace: 'public', name: 'test' });
        expect(table.get(7002)).to.be.null;
    });
});

describe('StorageEngine - DDL', () => {
    let storageEngine;

    beforeEach(async () => {
        storageEngine = await createEngine();
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

        let table = tx.getTable({ namespace: 'public', name: 'idx_tbl' });
        expect(table.schema.indexes.has('idx_tbl__fname_manual_idx')).to.be.true;

        await tx.alterIndex({ namespace: 'public', table: 'idx_tbl', name: 'idx_tbl__fname_manual_idx' }, { name: 'idx_tbl__fname_manual_idx2' });
        table = tx.getTable({ namespace: 'public', name: 'idx_tbl' });
        expect(table.schema.indexes.has('idx_tbl__fname_manual_idx2')).to.be.true;

        await tx.dropIndex({ namespace: 'public', table: 'idx_tbl', name: 'idx_tbl__fname_manual_idx2' });
        table = tx.getTable({ namespace: 'public', name: 'idx_tbl' });
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
        await tx.abort();

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

        const parents = tx.getTable({ namespace: 'public', name: 'parents_comp' });
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

        const children = tx.getTable({ namespace: 'public', name: 'children_full' });
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

        const children = tx.getTable({ namespace: 'public', name: 'children_partial' });
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

        const children = tx.getTable({ namespace: 'public', name: 'children_none' });
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
        const events = verifyTx.getTable({ namespace: 'public', name: 'events' });
        expect(events.get(1)).to.be.null;
    });

    it('does not expose uncommitted writes across transactions', async () => {
        const storageEngine = await createEngine();

        const tx1 = storageEngine.begin();
        const t1 = tx1.getTable({ namespace: 'public', name: 'test' });
        await t1.insert({ id: 9991, name: 'InvisibleUntilCommit' });

        const tx2 = storageEngine.begin();
        const t2 = tx2.getTable({ namespace: 'public', name: 'test' });
        expect(t2.get(9991)).to.be.null;

        await tx1.commit();

        const tx3 = storageEngine.begin();
        const t3 = tx3.getTable({ namespace: 'public', name: 'test' });
        expect(t3.get(9991)).to.deep.include({ id: 9991, name: 'InvisibleUntilCommit' });
    });
});

describe('StorageEngine - Persistent WAL Integration', () => {
    it('replays persisted WAL and rehydrates sequences on init', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-test'], registry });

        const engine1 = new StorageEngine({ keyval });
        await engine1.init();

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
            const users = tx.getTable({ namespace: 'public', name: 'persist_users' });
            const r1 = await users.insert({ name: 'A' });
            const r2 = await users.insert({ name: 'B' });
            expect(r1.id).to.eq(1);
            expect(r2.id).to.eq(2);
        });

        const engine2 = new StorageEngine({ keyval: new InMemoryKV({ path: ['linkedql-test'], registry }) });
        await engine2.init();

        const tx2 = engine2.begin();
        const users2 = tx2.getTable({ namespace: 'public', name: 'persist_users' });
        const persisted = users2.getAll();
        expect(persisted.map((r) => r.name)).to.deep.eq(['A', 'B']);

        const r3 = await users2.insert({ name: 'C' });
        expect(r3.id).to.eq(3);
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
        await tx.abort();

        expect(storageEngine.getSessionConfig('search_path')).to.deep.eq(['public']);
    });

    it('rejects non-string config values', async () => {
        const storageEngine = await createEngine();
        expect(() => storageEngine.setSessionConfig('search_path', [123])).to.throw();
    });
});

describe('StorageEngine - Error And Validation Paths', () => {
    it('throws for unknown replay op', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();

        await expect(tx.replay([
            { op: 'upsert', relation: { namespace: 'public', name: 'test' }, new: { id: 1, name: 'X' } }
        ])).to.be.rejectedWith('Unknown op type');
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
        })).to.be.rejectedWith('Invalid relation kind');

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

        const parent = tx.getTable({ namespace: 'public', name: 'parent_fk' });
        const child = tx.getTable({ namespace: 'public', name: 'child_fk' });
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

    it('update rejects missing row', async () => {
        await expect(users.update({ id: 404 }, { id: 404, fname: 'X' })).to.be.rejected;
    });

    it('delete rejects missing row', async () => {
        await expect(users.delete({ id: 404 })).to.be.rejected;
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
        await tx.abort();
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
        await expect(tx.commit()).to.be.rejectedWith('Invalid transaction state');
    });

    it('abort is idempotent for already aborted tx', async () => {
        const storageEngine = await createEngine();
        const tx = storageEngine.begin();
        await tx.abort();
        await expect(tx.abort()).to.not.be.rejected;
    });
});

describe('StorageEngine - Persistence Metadata Nuances', () => {
    it('creates WAL head after first persisted commit', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-meta-1'], registry });
        const storageEngine = new StorageEngine({ keyval });
        await storageEngine.init();

        const metaKV = keyval.enter(['meta']);
        expect(await metaKV.get('latestCommit')).to.be.a('number');
    });

    it('stores WAL payload with sequenceHeads and changes', async () => {
        const registry = new Map();
        const keyval = new InMemoryKV({ path: ['linkedql-meta-2'], registry });
        const storageEngine = new StorageEngine({ keyval });
        await storageEngine.init();

        await storageEngine.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'wal_payload_tbl',
                columns: [{ name: 'id', type: 'INT', is_generated: true, generation_rule: 'by_default' }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
            const tbl = tx.getTable({ namespace: 'public', name: 'wal_payload_tbl' });
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
        const storageEngine = new StorageEngine({ keyval });
        await storageEngine.init();

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

            const table = tx.getTable({ namespace: 'public', name: 'mvcc_case' });
            await table.insert({ id: 1, name: 'row1' });
            await table.insert({ id: 2, name: 'row2' });
        });

        return storageEngine;
    };

    it('FUW + FUW: second writer conflicts eagerly on same row', async () => {
        const storageEngine = await setup();
        const tx1 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const tx2 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const t1 = tx1.getTable({ namespace: 'public', name: 'mvcc_case' });
        const t2 = tx2.getTable({ namespace: 'public', name: 'mvcc_case' });

        await expect(t1.update(1, { id: 1, name: 'tx1' })).to.not.be.rejected;
        await expect(t2.update(1, { id: 1, name: 'tx2' })).to.be.rejectedWith('Write conflict');
    });

    it('FUW + FUW: concurrent writes on different rows both succeed', async () => {
        const storageEngine = await setup();
        const tx1 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const tx2 = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const t1 = tx1.getTable({ namespace: 'public', name: 'mvcc_case' });
        const t2 = tx2.getTable({ namespace: 'public', name: 'mvcc_case' });

        await expect(t1.update(1, { id: 1, name: 'tx1' })).to.not.be.rejected;
        await expect(t2.update(2, { id: 2, name: 'tx2' })).to.not.be.rejected;
        await expect(tx1.commit()).to.not.be.rejected;
        await expect(tx2.commit()).to.not.be.rejected;
    });

    it('FCW + FCW: both writes can proceed; second commit loses', async () => {
        const storageEngine = await setup();
        const tx1 = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const tx2 = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const t1 = tx1.getTable({ namespace: 'public', name: 'mvcc_case' });
        const t2 = tx2.getTable({ namespace: 'public', name: 'mvcc_case' });

        await expect(t1.update(1, { id: 1, name: 'tx1' })).to.not.be.rejected;
        await expect(t2.update(1, { id: 1, name: 'tx2' })).to.not.be.rejected;

        await expect(tx1.commit()).to.not.be.rejected;
        await expect(tx2.commit()).to.be.rejectedWith('Commit-time write conflict');
    });

    it('FCW + FCW: read conflict at commit time after concurrent committed write', async () => {
        const storageEngine = await setup();
        const txReader = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const txWriter = storageEngine.begin({ strategySpec: 'first_committer_wins' });

        const readerTable = txReader.getTable({ namespace: 'public', name: 'mvcc_case' });
        const writerTable = txWriter.getTable({ namespace: 'public', name: 'mvcc_case' });

        expect(readerTable.get(1).name).to.eq('row1'); // registers read set
        await writerTable.update(1, { id: 1, name: 'writer' });
        await txWriter.commit();

        await expect(txReader.commit()).to.be.rejectedWith('Commit-time read conflict');
    });

    it('FUW + FCW: second writer conflicts eagerly on same row', async () => {
        const storageEngine = await setup();
        const txFUW = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const txFCW = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const tFUW = txFUW.getTable({ namespace: 'public', name: 'mvcc_case' });
        const tFCW = txFCW.getTable({ namespace: 'public', name: 'mvcc_case' });

        await expect(tFUW.update(1, { id: 1, name: 'fuw' })).to.not.be.rejected;
        await expect(tFCW.update(1, { id: 1, name: 'fcw' })).to.be.rejectedWith('Write conflict');
    });

    it('FCW + FUW: second writer conflicts eagerly on same row', async () => {
        const storageEngine = await setup();
        const txFCW = storageEngine.begin({ strategySpec: 'first_committer_wins' });
        const txFUW = storageEngine.begin({ strategySpec: 'first_updater_wins' });
        const tFCW = txFCW.getTable({ namespace: 'public', name: 'mvcc_case' });
        const tFUW = txFUW.getTable({ namespace: 'public', name: 'mvcc_case' });

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
            const t = tx.getTable({ namespace: 'public', name: 'ser_case' });
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
        const t1 = tx1.getTable({ namespace: 'public', name: 'ser_case' });
        const t2 = tx2.getTable({ namespace: 'public', name: 'ser_case' });

        await t1.update(1, { id: 1, name: 'X1' });
        await t2.update(1, { id: 1, name: 'X2' });

        await expect(tx1.commit()).to.not.be.rejected;
        await expect(tx2.commit()).to.be.rejectedWith('Commit-time write conflict');
    });

    it('serializable read conflict is detected at commit time', async () => {
        const storageEngine = await setup();
        const txReader = storageEngine.begin({ strategySpec: 'serializable' });
        const txWriter = storageEngine.begin({ strategySpec: 'serializable' });
        const tr = txReader.getTable({ namespace: 'public', name: 'ser_case' });
        const tw = txWriter.getTable({ namespace: 'public', name: 'ser_case' });

        expect(tr.get(1).name).to.eq('A');
        await tw.update(1, { id: 1, name: 'B' });
        await txWriter.commit();

        await expect(txReader.commit()).to.be.rejectedWith('Commit-time read conflict');
    });

    it('serializable detects phantom conflict on full scan', async () => {
        const storageEngine = await setup();
        const txScan = storageEngine.begin({ strategySpec: 'serializable' });
        const txInsert = storageEngine.begin({ strategySpec: 'serializable' });
        const ts = txScan.getTable({ namespace: 'public', name: 'ser_case' });
        const ti = txInsert.getTable({ namespace: 'public', name: 'ser_case' });

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
        const ts = txScan.getTable({ namespace: 'public', name: 'ser_case' });
        const to = txOther.getTable({ namespace: 'public', name: 'ser_other' });

        ts.getAll();
        await to.insert({ id: 10 });
        await txOther.commit();

        await expect(txScan.commit()).to.not.be.rejected;
    });
});
