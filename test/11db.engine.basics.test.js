import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { matchRelationSelector, normalizeRelationSelectorArg } from '../src/entry/abstracts/util.js';
import { StorageEngine } from '../src/flashql/StorageEngine.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { TableStorage } from '../src/flashql/TableStorage.js';

describe('Util', () => {

    it('should normalize selector forms', () => {
        expect(() => normalizeRelationSelectorArg()).to.throw(/Given selector .* invalid/);
        expect(() => normalizeRelationSelectorArg(null)).to.throw(/Given selector .* invalid/);
        expect(() => normalizeRelationSelectorArg({})).to.throw(/Given selector .* invalid/);

        expect(() => normalizeRelationSelectorArg([{ namespace: 'b' }, { a: 'b' }])).to.throw(/Given selector .* invalid at index 1/);

        const a = normalizeRelationSelectorArg('*');
        expect(a).to.deep.eq({ ['*']: ['*'] });
        const b = normalizeRelationSelectorArg({ a: 'b' });
        expect(b).to.deep.eq({ a: ['b'] });
        const c = normalizeRelationSelectorArg([{ namespace: 'b' }]);
        expect(c).to.deep.eq({ b: ['*'] });
    });

    it('should match plain db selector', () => {
        const a = matchRelationSelector('lq_test_public', ['lq_test_public', 'lq_test_private']);
        const b = matchRelationSelector('lq_test_public', ['lq_test_public2', 'lq_test_private']);
        expect(a).to.be.true;
        expect(b).to.be.false;
    });

    it('should match negated plain db selector', () => {
        const a = matchRelationSelector('lq_test_public', ['!lq_test_public', 'lq_test_private']);
        const b = matchRelationSelector('lq_test_public', ['!lq_test_public2', 'lq_test_public']);
        const c = matchRelationSelector('lq_test_public', ['!lq_test_public2', '!lq_test_private']);
        expect(a).to.be.false;
        expect(b).to.be.true;
        expect(c).to.be.true;
    });

    it('should match wildcard db selector', () => {
        const a = matchRelationSelector('lq_test_public', ['%ublic', 'lq_test_private']);
        const b = matchRelationSelector('lq_test_public', ['publi%']);
        const c = matchRelationSelector('lq_test_public', ['publo%']);
        expect(a).to.be.true;
        expect(b).to.be.true;
        expect(c).to.be.false;
    });

    it('should match negated wildcard db selector', () => {
        const a = matchRelationSelector('lq_test_public', ['!%ublic', 'lq_test_private']);
        const b = matchRelationSelector('lq_test_public', ['!publi%']);
        const c = matchRelationSelector('lq_test_public', ['!publo%']);
        expect(a).to.be.false;
        expect(b).to.be.false;
        expect(c).to.be.true;
    });
});

describe('StorageEngine - Basic CRUD', () => {
    let storageEngine, lq_test_public, tbl1;

    describe('SCHEMA', () => {
        it('should create basic table namespace', async () => {
            storageEngine = new StorageEngine({ defaultNamespace: 'lq_test_public' });
            lq_test_public = await storageEngine.getNamespace('lq_test_public');

            tbl1 = await lq_test_public.createTable('tbl1');
            expect(tbl1).to.be.instanceOf(TableStorage);
        });

        it('should reject creating an existing table namespace', async () => {
            expect(lq_test_public.createTable('tbl1')).to.be.rejected;
        });

        it('should retrieve just-created table namespace', async () => {
            const tableNames = await lq_test_public.tableNames();
            expect(tableNames).to.include('tbl1');

            const tblSchema = tbl1.schema;
            expect(tblSchema).to.be.an('object');
        });
    });

    describe('INSERT', () => {
        it('should do basic INSERT', async () => {
            const row = await tbl1.insert({ id: 34, name: 'John' });
            expect(row).to.deep.eq({ id: 34, name: 'John' });
        });

        it('should reject duplicate-key INSERT', async () => {
            expect(tbl1.insert({ id: 34, name: 'John' })).to.be.rejected;
        });

        it('should do auto-increment', async () => {
            const row1 = await tbl1.insert({ name: 'John' });
            expect(row1).to.deep.eq({ name: 'John', id: 1 });

            const row2 = await tbl1.insert({ name: 'John' });
            expect(row2).to.deep.eq({ name: 'John', id: 2 });
        });
    });

    describe('UPDATE', () => {
        it('should do basic UPDATE', async () => {
            const row = await tbl1.update({ id: 34 }, { id: 34, name: 'John2' });
            expect(row).to.deep.eq({ id: 34, name: 'John2' });
        });
    });

    describe('READ', () => {
        it('should do basic READ', async () => {
            const record = await tbl1.get({ id: 34 });
            expect(record).to.deep.eq({ id: 34, name: 'John2' });
        });

        it('should do basic scan', async () => {
            const records = tbl1;
            const _records = [];
            for await (const record of records) {
                _records.push(record);
            }
            expect(_records).to.have.length(3);
            expect(_records[0]).to.deep.eq({ id: 34, name: 'John2' });
        });
    });

    describe('DELETE', () => {
        it('should do basic DELETE', async () => {
            const row = await tbl1.delete({ id: 34 });
            expect(row).to.deep.eq({ id: 34, name: 'John2' });

            const record = await tbl1.get({ id: 34 });
            expect(record).to.be.undefined;
        });
    });
});

const createClient = async (defaultNamespace = undefined, otherOptions = {}) => {
    const client = new FlashQL({ defaultNamespace, ...otherOptions });
    await client.connect();
    return client;
};

describe('FlashQL - Basic DDL', () => {
    let client;

    before(async () => {
        client = await createClient();
    });

    after(async () => {
        await client.disconnect();
    });

    // ---------- CREATE/DROP

    describe('CREATE SCHEMA', () => {
        it('should create namespace with IF NOT EXISTS', async () => {
            const result = await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_namespace');
            expect(result).to.exist;
            const namespaces = await client.storageEngine.namespaceNames();
            expect(namespaces).to.include('lq_test_namespace');
        });

        it('should not create namespace if already exists', async () => {
            await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_namespace');
            await expect(client.query('CREATE SCHEMA lq_test_namespace')).to.be.rejected;
        });

        // Advanced: create namespace with AUTHORIZATION (Postgres syntax)
        it('should support CREATE SCHEMA ... AUTHORIZATION', async () => {
            const result = await client.query('CREATE SCHEMA IF NOT EXISTS lq_auth AUTHORIZATION current_user');
            expect(result).to.exist;
            const namespaces = await client.storageEngine.namespaceNames();
            expect(namespaces).to.include('lq_auth');
        });
    });

    describe('DROP SCHEMA', () => {
        before(async () => {
            await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_drop');
            await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_drop2');
        });

        it('should drop namespace with IF EXISTS', async () => {
            const result = await client.query('DROP SCHEMA IF EXISTS lq_test_drop CASCADE');
            expect(result).to.exist;
            const namespaces = await client.storageEngine.namespaceNames();
            expect(namespaces).to.not.include('lq_test_drop');
        });

        it('should not fail dropping non-existent namespace', async () => {
            await expect(client.query('DROP SCHEMA IF EXISTS lq_nonexistent CASCADE')).to.not.be.rejected;
        });

        // Advanced: drop multiple namespaces
        it('should drop multiple namespaces in one command', async () => {
            await client.query('CREATE SCHEMA IF NOT EXISTS lq_multi1');
            await client.query('CREATE SCHEMA IF NOT EXISTS lq_multi2');
            const result = await client.query('DROP SCHEMA IF EXISTS lq_multi1, lq_multi2 CASCADE');
            expect(result).to.exist;
            const namespaces = await client.storageEngine.namespaceNames();
            expect(namespaces).to.not.include('lq_multi1');
            expect(namespaces).to.not.include('lq_multi2');
        });

        // Advanced: RESTRICT should prevent drop if namespace not empty
        it('should reject DROP SCHEMA ... RESTRICT when namespace not empty', async () => {
            await client.query('CREATE SCHEMA IF NOT EXISTS lq_restrict');
            await client.query('CREATE TABLE IF NOT EXISTS lq_restrict.tbl1 (id INT PRIMARY KEY)');
            await expect(client.query('DROP SCHEMA lq_restrict RESTRICT')).to.be.rejected;
            const result = await client.query('DROP SCHEMA lq_restrict CASCADE');
            expect(result).to.exist;
            const namespaces = await client.storageEngine.namespaceNames();
            expect(namespaces).to.not.include('lq_restrict');
        });
    });

    describe('CREATE TABLE', () => {
        before(async () => {
            await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_table');
        });

        it('should create table in namespace', async () => {
            const result = await client.query('CREATE TABLE lq_test_table.tbl1 (id INT PRIMARY KEY, name TEXT)');
            const lq_test_table = await client.storageEngine.getNamespace('lq_test_table');

            expect(result).to.exist;
            const tables = await lq_test_table.tableNames();
            expect(tables).to.include('tbl1');
        });

        it('should not create table if already exists', async () => {
            await expect(client.query('CREATE TABLE lq_test_table.tbl1 (id INT PRIMARY KEY, name TEXT)')).to.be.rejected;
        });

        it('should support IF NOT EXISTS', async () => {
            await expect(client.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl1 (id INT PRIMARY KEY, name TEXT)')).to.not.be.rejected;
        });

        // Advanced: TEMPORARY keyword should throw on in-mem engine
        it('should throw on CREATE TEMPORARY TABLE', async () => {
            await expect(client.query('CREATE TEMPORARY TABLE lq_test_table.temp_tbl (id INT)')).to.be.rejected;
        });
    });

    describe('DROP TABLE', () => {
        before(async () => {
            await client.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl2 (id INT PRIMARY KEY)');
        });

        it('should drop table with IF EXISTS', async () => {
            const result = await client.query('DROP TABLE IF EXISTS lq_test_table.tbl2');
            expect(result).to.exist;
            const lq_test_table = await client.storageEngine.getNamespace('lq_test_table');
            const tables = await lq_test_table.tableNames();
            expect(tables).to.not.include('tbl2');
        });

        it('should not fail dropping non-existent table', async () => {
            await expect(client.query('DROP TABLE IF EXISTS lq_test_table.tbl2')).to.not.be.rejected;
        });

        it('should support dropping multiple tables', async () => {
            await client.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl3 (id INT PRIMARY KEY)');
            await client.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl4 (id INT PRIMARY KEY)');
            const result = await client.query('DROP TABLE IF EXISTS lq_test_table.tbl3, lq_test_table.tbl4');
            expect(result).to.exist;
            const lq_test_table = await client.storageEngine.getNamespace('lq_test_table');
            const tables = await lq_test_table.tableNames();
            expect(tables).to.not.include('tbl3');
            expect(tables).to.not.include('tbl4');
        });

        // Advanced: CASCADE should drop dependent objects
        it('should drop table with CASCADE when dependencies exist', async () => {
            await client.query('CREATE TABLE IF NOT EXISTS lq_test_table.parent (id INT PRIMARY KEY)');
            await client.query('CREATE TABLE IF NOT EXISTS lq_test_table.child (id INT PRIMARY KEY, pid INT REFERENCES lq_test_table.parent(id))');
            await expect(client.query('DROP TABLE lq_test_table.parent CASCADE')).to.not.be.rejected;
            const lq_test_table = await client.storageEngine.getNamespace('lq_test_table');
            const tables = await lq_test_table.tableNames();
            expect(tables).to.not.include('parent');
            //expect(tables).to.not.include('child'); // TODO
        });

        // Advanced: TEMPORARY keyword should throw on in-mem engine
        it('should throw on DROP TEMPORARY TABLE', async () => {
            await expect(client.query('DROP TEMPORARY TABLE lq_test_table.nonexistent', { dialect: 'mysql' })).to.be.rejected;
        });
    });

    after(async () => {
        await client.query('DROP SCHEMA lq_test_table CASCADE');
    });

    // ---------- ALTER (TODO)
});

describe('FlashQL - DDL Inference', () => {
    let client;

    before(async () => {
        client = await createClient();
    });

    after(async () => {
        await client.disconnect();
    });

    before(async () => {
        await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_show');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_show.tbl1 (id INT PRIMARY KEY)');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_show.tbl2 (id INT PRIMARY KEY)');

        await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_public');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_public.tbl1 (id INT PRIMARY KEY)');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_public.tbl2 (id INT PRIMARY KEY)');

        await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_private');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_private.tbl1 (id INT PRIMARY KEY)');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_private.tbl2 (id INT PRIMARY KEY)');
    });

    describe('SHOW CREATE', () => {

        it('should show create for namespace', async () => {
            const result = await client.showCreate({ lq_test_show: ['*'] }, true);
            expect(result).to.have.lengthOf(1);
            expect(result[0].name().value()).to.eq('lq_test_show');
            expect(result[0].tables()).to.have.lengthOf(2);
        });

        it('should show create for specific table', async () => {
            const result = await client.showCreate({ lq_test_show: ['tbl1'] }, true);
            expect(result).to.have.lengthOf(1);
            expect(result[0].tables()).to.have.lengthOf(1);
            expect(result[0].tables()[0].name().value()).to.eq('tbl1');
        });

        it('should show create for negated table', async () => {
            const result = await client.showCreate({ lq_test_show: ['!tbl1'] }, true);
            expect(result).to.have.lengthOf(1);
            expect(result[0].tables()).to.have.lengthOf(1);
            expect(result[0].tables()[0].name().value()).to.eq('tbl2');
        });

        it('should show create for wildcard namespace', async () => {
            const result = await client.showCreate({ ['*']: ['tbl1'] }, true);
            expect(result.some(s => s.tables().some(t => t.name().value() === 'tbl1'))).to.be.true;
        });

        // --- Extended usage patterns ---

        it('should showCreate() for given selector (1)', async () => {
            const a = await client.showCreate({ lq_test_public: ['*'] }, true);
            expect(a).to.have.lengthOf(1);
            expect(a[0].name().value()).to.eq('lq_test_public');

            const b = await client.showCreate([{ namespace: 'lq_test_public', tables: ['*'] }], true);
            const c = await client.showCreate({ lq_test_public: ['*'] }, true);

            expect(b).to.have.lengthOf(1);
            expect(c).to.have.lengthOf(1);

            expect(b[0].tables()).to.have.lengthOf(2);
            expect(c[0].tables()).to.have.lengthOf(2);

            expect(b[0].tables().map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl2']);
            expect(c[0].tables().map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl2']);
        });

        it('should showCreate() for given selector (2)', async () => {
            const b = await client.showCreate({ lq_test_public: ['tbl1'] }, true);
            const c = await client.showCreate({ lq_test_public: ['!tbl1'] }, true);

            expect(b).to.have.lengthOf(1);
            expect(c).to.have.lengthOf(1);

            expect(b[0].tables()).to.have.lengthOf(1);
            expect(c[0].tables()).to.have.lengthOf(1);

            expect(b[0].tables()[0].name().value()).to.eq('tbl1');
            expect(c[0].tables()[0].name().value()).to.eq('tbl2');
        });

        it('should showCreate() for given selector (3)', async () => {
            const b = await client.showCreate({ ['*']: ['tbl1'] }, true);
            const c = await client.showCreate({ ['*']: ['!tbl1'] }, true);

            expect(b).to.have.lengthOf(4); // Plus the default "public" namespace
            expect(c).to.have.lengthOf(4); // Plus the default "public" namespace

            expect(b[1].tables()).to.have.lengthOf(1);
            expect(b[1].tables()[0].name().value()).to.eq('tbl1');

            expect(c[2].tables()).to.have.lengthOf(1);
            expect(b[2].tables()[0].name().value()).to.eq('tbl1');
            expect(c[2].tables()[0].name().value()).to.eq('tbl2');
        });

        it('should showCreate() for given selector (4)', async () => {
            const b = await client.showCreate({ ['*']: ['tbl1'] });
            const c = await client.showCreate({ ['*']: ['*'] });

            expect(b.map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl1', 'tbl1']);
            expect(c.map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl2', 'tbl1', 'tbl2', 'tbl1', 'tbl2']);
        });
    });

    describe('PROVIDE', () => {
        it('should provide() the specified namespace', async () => {
            const resultCode = await client.schemaInference.provide([{ namespace: 'lq_test_%', tables: ['tbl1'] }]);
            const catalog = [...client.schemaInference.catalog];

            expect(resultCode).to.eq(1);
            expect(catalog).to.have.lengthOf(3);

            const lq_test_show = catalog.find((s) => s.identifiesAs('lq_test_show'));
            const lq_test_public = catalog.find((s) => s.identifiesAs('lq_test_public'));
            const lq_test_private = catalog.find((s) => s.identifiesAs('lq_test_private'));

            expect(lq_test_show.tables()).to.have.lengthOf(1);
            expect(lq_test_public.tables()).to.have.lengthOf(1);
            expect(lq_test_private.tables()).to.have.lengthOf(1);

            // ----------------- heuristic caching
            const resultCode2 = await client.schemaInference.provide([{ namespace: 'lq_test_%', tables: ['tbl1'] }]);
            expect(resultCode2).to.eq(0);
            const resultCode3 = await client.schemaInference.provide([{ namespace: 'lq_test_private', tables: ['tbl1'] }]);
            expect(resultCode3).to.eq(0);
            const resultCode4 = await client.schemaInference.provide([{ namespace: 'lq_test_foo', tables: ['tbl1'] }]);
            expect(resultCode4).to.eq(0);
            const resultCode5 = await client.schemaInference.provide([{ namespace: 'lq_test_%', tables: ['tbl1', 'tbl_1'] }]);
            expect(resultCode5).to.eq(2);
        });

        it('should incrementally provide() the specified namespace', async () => {
            const resultCode = await client.schemaInference.provide([{ namespace: 'lq_test_%', tables: ['tbl2'] }]);
            const catalog = [...client.schemaInference.catalog];

            expect(resultCode).to.eq(1);
            expect(catalog).to.have.lengthOf(3);

            const lq_test_show = catalog.find((s) => s.identifiesAs('lq_test_show'));
            const lq_test_public = catalog.find((s) => s.identifiesAs('lq_test_public'));
            const lq_test_private = catalog.find((s) => s.identifiesAs('lq_test_private'));

            expect(lq_test_show.tables()).to.have.lengthOf(2);
            expect(lq_test_public.tables()).to.have.lengthOf(2);
            expect(lq_test_private.tables()).to.have.lengthOf(2);
        });
    });
});

describe('FlashQL - DML', () => {
    let client;

    // helper to read table storage rows (values)
    async function tableRows(tableName, namespace = 'lq_test_dml') {
        const namespaceObject = await await client.storageEngine.getNamespace(namespace);
        const tableStorage = await namespaceObject.getTable(tableName);
        const rows = [];
        for await (const row of tableStorage) rows.push(row);
        return rows;
    }

    // helper to clear tables by name
    async function clearTable(tableName, namespace = 'lq_test_dml') {
        const namespaceObject = await await client.storageEngine.getNamespace(namespace);
        const tableStorage = await namespaceObject.getTable(tableName);
        await tableStorage.truncate();
    }

    before(async () => {
        client = await createClient();

        // prepare namespace + tables used across the tests
        await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_dml');

        // people: PK (manual), used for many tests
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_dml.people (id INT PRIMARY KEY, name TEXT, age INT)');

        // identity / defaults tests
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_dml.auto_people (id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name TEXT)');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_dml.defaults (id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, cnt INT DEFAULT 7)');

        // for update-from / join-based tests
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_dml.updates (person_id INT PRIMARY KEY, new_name TEXT)');

        // for multi-table update/delete tests
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_dml.multi_a (id INT PRIMARY KEY, val INT)');
        await client.query('CREATE TABLE IF NOT EXISTS lq_test_dml.multi_b (id INT PRIMARY KEY, val INT)');

        // ensure tables are empty before tests start
        for (const t of ['people', 'auto_people', 'defaults', 'updates', 'multi_a', 'multi_b']) {
            try { await clearTable(t); } catch (e) { /* ignore */ }
        }
    });

    after(async () => {
        await client.disconnect();
    });

    // ---------- INSERT ----------
    describe('INSERT variants', () => {

        beforeEach(async () => {
            // ensure clean slate
            await clearTable('people');
            await clearTable('auto_people');
            await clearTable('defaults');
        });

        it('INSERT ... VALUES (single row)', async () => {
            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (1, 'Alice', 30)");
            const rows = await tableRows('people');
            expect(rows).to.have.lengthOf(1);
            expect(rows[0]).to.deep.include({ id: 1, name: 'Alice', age: 30 });
        });

        it('INSERT ... VALUES (multiple rows)', async () => {
            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (2, 'Bob', 25), (3, 'Carol', 28)");
            const rows = await tableRows('people');
            expect(rows.map(r => r.id).sort()).to.deep.eq([2, 3]);
        });

        it('INSERT ... DEFAULT VALUES (Postgres) uses defaults', async () => {
            // defaults table has id identity and cnt default 7
            const res = await client.query("INSERT INTO lq_test_dml.defaults DEFAULT VALUES RETURNING *");
            // client.query should return returning rows; fallback to storage inspection if not
            if (res && res.rows) {
                expect(res.rows[0]).to.have.property('cnt', 7);
                expect(res.rows[0]).to.have.property('id');
            } else {
                const rows = await tableRows('defaults');
                expect(rows[0]).to.have.property('cnt', 7);
            }
        });

        it('MySQL: INSERT ... SET syntax', async () => {
            // use mysql dialect for SET form
            await client.query("INSERT INTO lq_test_dml.people SET id = 10, name = 'Zed', age = 50", { dialect: 'mysql' });
            const rows = await tableRows('people');
            expect(rows.some(r => r.id === 10 && r.name === 'Zed')).to.be.true;
        });

        it('INSERT ... RETURNING (Postgres)', async () => {
            await clearTable('people');
            const r = await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (20, 'X', 99) RETURNING id, name");
            expect(r.rows).to.have.lengthOf(1);
            expect(r.rows[0]).to.deep.eq({ id: 20, name: 'X' });
        });

        it('INSERT ... ON CONFLICT DO NOTHING (Postgres)', async () => {
            await clearTable('people');
            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (30, 'Sam', 40)");
            const r = await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (30, 'SamX', 41) ON CONFLICT (id) DO NOTHING RETURNING *");
            // returning should be empty
            expect(r.rows).to.have.lengthOf(0);
            // underlying row unchanged
            const rows = await tableRows('people');
            expect(rows.find(row => row.id === 30).name).to.eq('Sam');
        });

        it('INSERT ... ON CONFLICT DO UPDATE (Postgres)', async () => {
            await clearTable('people');
            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (31, 'Ann', 23)");
            const r = await client.query(`
                INSERT INTO lq_test_dml.people (id, name, age) VALUES (31, 'AnnX', 24)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, age = EXCLUDED.age
                RETURNING *`);
            expect(r.rows[0]).to.deep.include({ id: 31, name: 'AnnX', age: 24 });
            const rows = await tableRows('people');
            expect(rows.find(x => x.id === 31).name).to.eq('AnnX');
        });

        it('MySQL: INSERT ... ON DUPLICATE KEY UPDATE', async () => {
            await clearTable('people');
            // Insert initial row
            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (200, 'M', 60)", { dialect: 'mysql' });
            // Duplicate insert with ON DUPLICATE KEY UPDATE
            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (200, 'M2', 61) ON DUPLICATE KEY UPDATE name = VALUES(name), age = VALUES(age)", { dialect: 'mysql' });
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 200)).to.deep.include({ name: 'M2', age: 61 });
        });
    });

    // ---------- UPDATE ----------
    describe('UPDATE variants', () => {

        beforeEach(async () => {
            // reset tables used in updates
            await clearTable('people');
            await clearTable('updates');
            await clearTable('multi_a');
            await clearTable('multi_b');

            // seed baseline data
            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (401, 'U1', 20), (402, 'U2', 25)");
            await client.query("INSERT INTO lq_test_dml.multi_a (id, val) VALUES (1, 10), (2, 20)");
            await client.query("INSERT INTO lq_test_dml.multi_b (id, val) VALUES (1, 100), (2, 200)");
        });

        it('UPDATE ... SET ... WHERE (basic)', async () => {
            await client.query("UPDATE lq_test_dml.people SET age = 21 WHERE id = 401");
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 401).age).to.eq(21);
        });

        it('UPDATE (Postgres) ... FROM join', async () => {
            // prepare updates table
            await client.query("INSERT INTO lq_test_dml.updates (person_id, new_name) VALUES (401, 'UpdatedU1')");
            const r = await client.query(`
                UPDATE lq_test_dml.people p
                SET name = u.new_name
                FROM lq_test_dml.updates u
                WHERE p.id = u.person_id
                RETURNING p.*`);
            // returning should show updated name
            expect(r.rows[0].name).to.eq('UpdatedU1');
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 401).name).to.eq('UpdatedU1');
        });

        it('UPDATE (Postgres) tuple assignment: SET (a,b) = (x,y)', async () => {
            await client.query("UPDATE lq_test_dml.people SET (name, age) = ('Tupleed', 99) WHERE id = 402");
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 402)).to.deep.include({ name: 'Tupleed', age: 99 });
        });

        it('MySQL multi-table UPDATE (a, b syntax)', async () => {
            // update multi_a.val from multi_b.val using mysql multi-table update
            await client.query("UPDATE lq_test_dml.multi_a a, lq_test_dml.multi_b b SET a.val = b.val WHERE a.id = b.id", { dialect: 'mysql' });
            const aRows = await tableRows('multi_a');
            expect(aRows.find(r => r.id === 1).val).to.eq(100);
            expect(aRows.find(r => r.id === 2).val).to.eq(200);
        });

        it('UPDATE returns empty when no rows match', async () => {
            const r = await client.query("UPDATE lq_test_dml.people SET age = 999 WHERE id = 9999 RETURNING *");
            expect(r.rows).to.have.lengthOf(0);
        });
    });

    // ---------- DELETE ----------
    describe('DELETE variants', () => {

        beforeEach(async () => {
            // reset multi tables and people
            await clearTable('people');
            await clearTable('multi_a');
            await clearTable('multi_b');

            await client.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (601, 'D1', 40), (602, 'D2', 50)");
            await client.query("INSERT INTO lq_test_dml.multi_a (id, val) VALUES (10, 1), (11, 2)");
            await client.query("INSERT INTO lq_test_dml.multi_b (id, val) VALUES (10, 1), (11, 2)");
        });

        it('DELETE ... WHERE (basic)', async () => {
            await client.query("DELETE FROM lq_test_dml.people WHERE id = 601");
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 601)).to.be.undefined;
            expect(rows.some(r => r.id === 602)).to.be.true;
        });

        it('DELETE ... RETURNING (Postgres)', async () => {
            const r = await client.query("DELETE FROM lq_test_dml.people WHERE id = 602 RETURNING *");
            expect(r.rows[0]).to.deep.include({ id: 602, name: 'D2' });
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 602)).to.be.undefined;
        });

        it('MySQL: multi-table DELETE a,b FROM ... JOIN ...', async () => {
            // delete both multi_a and multi_b rows that match id=10
            await client.query("DELETE a, b FROM lq_test_dml.multi_a a JOIN lq_test_dml.multi_b b ON a.id = b.id WHERE a.id = 10", { dialect: 'mysql' });
            const aRows = await tableRows('multi_a');
            const bRows = await tableRows('multi_b');
            expect(aRows.find(r => r.id === 10)).to.be.undefined;
            expect(bRows.find(r => r.id === 10)).to.be.undefined;
            // ensure other rows remain
            expect(aRows.find(r => r.id === 11)).to.exist;
            expect(bRows.find(r => r.id === 11)).to.exist;
        });

        it('Postgres: DELETE ... USING ... (delete from a where exists in b)', async () => {
            // re-seed
            await clearTable('multi_a');
            await clearTable('multi_b');
            await client.query("INSERT INTO lq_test_dml.multi_a (id, val) VALUES (20, 1), (21, 2)");
            await client.query("INSERT INTO lq_test_dml.multi_b (id, val) VALUES (20, 1)");
            await client.query("DELETE FROM lq_test_dml.multi_a a USING lq_test_dml.multi_b b WHERE a.id = b.id");
            const aRows = await tableRows('multi_a');
            expect(aRows.find(r => r.id === 20)).to.be.undefined;
            expect(aRows.find(r => r.id === 21)).to.exist;
        });

        it('DELETE non-existent rows does not fail', async () => {
            const r = await client.query("DELETE FROM lq_test_dml.people WHERE id = 9999 RETURNING *");
            expect(r.rows).to.have.lengthOf(0);
        });
    });
});

describe("FlashQL - DQL", () => {

    describe("SELECT - Basics", () => {
        let client, namespaceName = 'lq_test_dgl', t1 = "t1";
        before(async () => {
            client = await createClient(namespaceName);

            // prepare namespace + tables used across the tests
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);
            await client.query(`CREATE TABLE ${t1} (id INT PRIMARY KEY, val TEXT)`);
            await client.query(`INSERT INTO ${t1} (id, val) VALUES (1, 'a'), (2, 'b'), (3, NULL)`);
        });

        it("should select a literal", async () => {
            const { rows } = await client.query(`SELECT 1 AS x`);
            expect(rows).to.deep.equal([{ x: 1 }]);
        });

        it("should select a single column", async () => {
            const { rows } = await client.query(`SELECT id FROM ${t1}`);
            expect(rows.map(r => r.id)).to.deep.equal([1, 2, 3]);
        });

        it("should alias a column", async () => {
            const { rows } = await client.query(`SELECT id AS ident FROM ${t1}`);
            expect(Object.keys(rows[0])).to.include("ident");
        });

        it("should select multiple columns", async () => {
            const { rows } = await client.query(`SELECT id, val FROM ${t1}`);
            expect(rows).to.have.length(3);
            expect(rows[0]).to.have.keys(["id", "val"]);
        });

        it("should select all columns with *", async () => {
            const { rows } = await client.query(`SELECT * FROM ${t1}`);
            expect(rows[0]).to.have.keys(["id", "val"]);
        });

        it("should apply DISTINCT", async () => {
            const { rows } = await client.query(`SELECT DISTINCT val FROM ${t1}`);
            const values = rows.map(r => r.val);
            expect(values).to.deep.equal(["a", "b", null]);
        });

        it("should filter with WHERE conditions", async () => {
            const { rows } = await client.query(`SELECT id FROM ${t1} WHERE id > 1`);
            expect(rows.map(r => r.id)).to.deep.equal([2, 3]);
        });

        it("should handle boolean expressions", async () => {
            const { rows } = await client.query(`SELECT id FROM ${t1} WHERE id > 1 AND val IS NOT NULL`);
            expect(rows.map(r => r.id)).to.deep.equal([2]);
        });

        it("should check for nulls correctly", async () => {
            const { rows } = await client.query(`SELECT id FROM ${t1} WHERE val IS NULL`);
            expect(rows.map(r => r.id)).to.deep.equal([3]);
        });
    });

    describe("SELECT - FROM Variants", () => {
        let client, namespaceName = 'lq_test_dgl', t1 = "t1";
        before(async () => {
            client = await createClient(namespaceName);

            // prepare namespace + tables used across the tests
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);
            await client.query(`CREATE TABLE ${t1} (id INT, val TEXT)`);
            await client.query(`INSERT INTO ${t1} (id, val) VALUES (1, 'a'), (2, 'b')`);
        });

        it("should select from a table", async () => {
            const { rows } = await client.query(`SELECT * FROM ${t1}`);
            expect(rows).to.have.length(2);
        });

        it("should select from VALUES with alias and column names", async () => {
            const { rows } = await client.query(`SELECT * FROM (VALUES (1, 'x'), (2, 'y')) AS v(c1, c2)`);
            expect(rows).to.deep.equal([{ c1: 1, c2: "x" }, { c1: 2, c2: "y" }]);
        });

        it("should select from a subquery with alias", async () => {
            const { rows } = await client.query(`SELECT sub.* FROM (SELECT id FROM ${t1}) AS sub`);
            expect(rows).to.deep.eq([{ id: 1 }, { id: 2 }]);
        });

        it("should not error even when subquery has no alias", async () => {
            const { rows } = await client.query(`SELECT * FROM (SELECT id FROM ${t1})`);
            expect(rows).to.deep.eq([{ id: 1 }, { id: 2 }]);
        });

        it("should select from a function call (simulate unnest)", async () => {
            const { rows } = await client.query(`SELECT * FROM unnest(ARRAY[10,20,30]) AS t(x)`);
            expect(rows).to.deep.eq([{ x: 10 }, { x: 20 }, { x: 30 }]);
        });

        it("should select from ROWS FROM (multiple funcs)", async () => {
            const { rows } = await client.query(`
                SELECT * FROM ROWS FROM (generate_series(1, 2), unnest(ARRAY['a','b'])) AS t(c1, c2)
            `);
            expect(rows).to.deep.equal([{ c1: 1, c2: "a" }, { c1: 2, c2: "b" }]);
        });

        it("should select with WITH ORDINALITY", async () => {
            const { rows } = await client.query(`
                SELECT * FROM unnest(ARRAY['x','y']) WITH ORDINALITY AS t(val, ord)
            `);
            expect(rows).to.deep.equal([{ val: "x", ord: 1 }, { val: "y", ord: 2 }]);
        });
    });

    describe("SELECT - Expressions & Operators", () => {
        let client, namespaceName = 'lq_test_exprs';

        before(async () => {
            client = await createClient(namespaceName);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);
            // tables
            await client.query(`CREATE TABLE expr_nums (id INT PRIMARY KEY, a INT, b INT, txt TEXT)`);
            await client.query(`INSERT INTO expr_nums (id, a, b, txt) VALUES
                (1, 10, 3, 'alpha'),
                (2, 5, NULL, 'beta'),
                (3, -2, 4, NULL)`); // includes NULLs, negative, etc.
        });

        after(async () => {
            await client.disconnect();
        });

        it('arithmetic operators (+, -, *, /, %)', async () => {
            const { rows } = await client.query(`SELECT id, a + 1 AS ap, a - b AS am, a * 2 AS amul, a / 2.0 AS adiv, a % 3 AS amod FROM expr_nums ORDER BY id`);
            expect(rows).to.have.lengthOf(3);
            expect(rows[0]).to.include({ id: 1, ap: 11, amul: 20 });
            // division and modulo sanity
            expect(rows.every(r => 'adiv' in r)).to.be.true;
        });

        it('comparison operators and NULL behavior', async () => {
            const { rows } = await client.query(`
                SELECT id FROM expr_nums
                WHERE (a > 0 AND (b IS NULL OR a > b)) OR (a < 0)
                ORDER BY id
            `);
            // rows: id=1 (10>3), id=2 (5>0 and b IS NULL), id=3 (a<0)
            expect(rows.map(r => r.id)).to.deep.equal([1, 2, 3]);
        });

        it('BETWEEN and IN operators', async () => {
            const { rows: r1 } = await client.query(`SELECT id FROM expr_nums WHERE a BETWEEN 0 AND 10 ORDER BY id`);
            expect(r1.map(r => r.id)).to.deep.equal([1, 2]);

            const { rows: r2 } = await client.query(`SELECT id FROM expr_nums WHERE id IN (1,3) ORDER BY id`);
            expect(r2.map(r => r.id)).to.deep.equal([1, 3]);
        });

        it('LIKE and pattern matching', async () => {
            const { rows } = await client.query(`SELECT id FROM expr_nums WHERE txt LIKE 'a%'`);
            expect(rows.map(r => r.id)).to.deep.equal([1]);
        });

        it('COALESCE and NULLIF', async () => {
            const { rows } = await client.query(`SELECT id, COALESCE(txt, 'missing') AS t, NULLIF(a, 10) AS nul FROM expr_nums ORDER BY id`);
            expect(rows[0].t).to.eq('alpha');
            expect(rows[2].t).to.eq('missing'); // txt NULL -> 'missing'
            // NULLIF(a,10) should be null for id=1
            expect(rows[0].nul).to.be.null;
        });

        it('CASE expressions (simple and searched)', async () => {
            const { rows } = await client.query(`
                SELECT id,
                CASE id WHEN 1 THEN 'one' WHEN 2 THEN 'two' ELSE 'other' END AS simpl,
                CASE WHEN a > 0 THEN 'pos' WHEN a < 0 THEN 'neg' ELSE 'zero' END AS searched
                FROM expr_nums ORDER BY id
            `);
            expect(rows.map(r => r.simpl)).to.deep.equal(['one', 'two', 'other']);
            expect(rows.map(r => r.searched)).to.deep.equal(['pos', 'pos', 'neg']);
        });

        it('ANY / ALL with ARRAY (where available)', async () => {
            // this is Postgres-style but many test engines emulate ARRAY syntax used elsewhere in tests
            const { rows } = await client.query(`SELECT id FROM expr_nums WHERE a = ANY(ARRAY[10,5]) ORDER BY id`);
            expect(rows.map(r => r.id)).to.deep.equal([1, 2]);
        });

        it('boolean precedence and parentheses', async () => {
            const { rows: r1 } = await client.query(`SELECT id FROM expr_nums WHERE a > 0 AND b IS NULL OR a < 0 ORDER BY id`);
            // Without parentheses this is (a>0 AND b IS NULL) OR (a<0) -> expect id=2 (5, null) and id=3 (a<0)
            expect(r1.map(r => r.id)).to.deep.equal([2, 3]);

            const { rows: r2 } = await client.query(`SELECT id FROM expr_nums WHERE a > 0 AND (b IS NULL OR a < 0) ORDER BY id`);
            // With parentheses: a>0 AND (b IS NULL OR a<0) -> only id=2
            expect(r2.map(r => r.id)).to.deep.equal([2]);
        });
    });

    describe("SELECT - Joins (incl. LATERAL)", () => {
        let client, namespaceName = 'lq_test_joins';

        before(async () => {
            client = await createClient(namespaceName);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);

            // join tables
            await client.query(`CREATE TABLE ja (id INT PRIMARY KEY, aname TEXT)`);
            await client.query(`CREATE TABLE jb (id INT PRIMARY KEY, bval TEXT)`);
            await client.query(`INSERT INTO ja (id, aname) VALUES (1, 'A1'), (2, 'A2'), (3, 'A3')`);
            await client.query(`INSERT INTO jb (id, bval) VALUES (1, 'B1'), (3, 'B3'), (4, 'B4')`);

            // tables to test USING/duplicate column names
            await client.query(`CREATE TABLE jc (id INT PRIMARY KEY, val INT)`);
            await client.query(`CREATE TABLE jd (id INT PRIMARY KEY, val2 INT)`);
            await client.query(`INSERT INTO jc (id,val) VALUES (1,10), (2,20)`);
            await client.query(`INSERT INTO jd (id,val2) VALUES (1,100), (3,300)`);

            // lateral table for expansion tests
            await client.query(`CREATE TABLE lateral_nums (id INT PRIMARY KEY, n INT)`);
            await client.query(`INSERT INTO lateral_nums (id, n) VALUES (1, 2), (2, 1), (3, 0)`);
        });

        after(async () => {
            await client.disconnect();
        });

        it('INNER JOIN (explicit ON) yields only matching rows', async () => {
            const { rows } = await client.query(`
                SELECT a.id AS aid, a.aname, b.id AS bid, b.bval
                FROM ja a JOIN jb b ON a.id = b.id
                ORDER BY aid
            `);
            // matches on id=1 and id=3
            expect(rows).to.have.lengthOf(2);
            expect(rows.map(r => r.aid)).to.deep.equal([1, 3]);
            expect(rows.some(r => r.bval === 'B3')).to.be.true;
        });

        it('implicit join (comma + WHERE) equals inner join', async () => {
            const { rows } = await client.query(`
                SELECT a.id AS aid, b.bval
                FROM ja a, jb b
                WHERE a.id = b.id
                ORDER BY aid
            `);
            expect(rows).to.have.lengthOf(2);
            expect(rows.map(r => r.aid)).to.deep.equal([1, 3]);
        });

        it('LEFT JOIN produces null-filled non-matching rows', async () => {
            const { rows } = await client.query(`
                SELECT a.id AS aid, b.bval
                FROM ja a LEFT JOIN jb b ON a.id = b.id
                ORDER BY a.id
            `);
            // should include all ja rows; for id=2, b.bval should be null
            expect(rows.map(r => r.aid)).to.deep.equal([1, 2, 3]);
            const row2 = rows.find(r => r.aid === 2);
            expect(row2.bval).to.be.null;
        });

        it('RIGHT JOIN preserves right side rows (if supported)', async () => {
            const { rows } = await client.query(`
                SELECT a.id AS aid, b.id AS bid
                FROM ja a RIGHT JOIN jb b ON a.id = b.id
                ORDER BY bid
            `);
            // jb contains id 1,3,4 -> expect 3 rows, with aid null for id=4
            expect(rows.map(r => r.bid)).to.deep.equal([1, 3, 4]);
            expect(rows.find(r => r.bid === 4).aid).to.be.null;
        });

        it('FULL JOIN returns union of both sides (if supported)', async () => {
            const { rows } = await client.query(`
                SELECT COALESCE(a.id, b.id) AS id
                FROM ja a FULL JOIN jb b ON a.id = b.id
                ORDER BY id
            `);
            // ids should be 1,2,3,4
            expect(rows.map(r => r.id)).to.deep.equal([1, 2, 3, 4]);
        });

        it('CROSS JOIN produces Cartesian product', async () => {
            const { rows } = await client.query(`SELECT a.id AS aid, b.id AS bid FROM ja a CROSS JOIN jb b`);
            // product size = 3 * 3 = 9
            expect(rows).to.have.lengthOf(9);
        });

        it('NATURAL JOIN auto-matches common column names', async () => {
            // natural join on id between jc and jd should return rows for id=1 only (both have id 1)
            const { rows } = await client.query(`SELECT * FROM jc NATURAL JOIN jd ORDER BY id`);
            // expect columns at least ['id','val','val2'] and single row
            expect(rows).to.have.lengthOf(1);
            expect(rows[0]).to.have.property('id', 1);
            expect(rows[0]).to.have.property('val', 10);
            expect(rows[0]).to.have.property('val2', 100);
        });

        it('JOIN ... USING merges join key into single column', async () => {
            const { rows } = await client.query(`
                SELECT id, val, val2 FROM jc JOIN jd USING (id) ORDER BY id
            `);
            // should have one row for id=1
            expect(rows).to.have.lengthOf(1);
            expect(rows[0]).to.deep.include({ id: 1, val: 10, val2: 100 });
        });

        it('JOIN ... ON vs JOIN ... USING behavior for column names', async () => {
            const { rows: r1 } = await client.query(`
                SELECT a.id AS aid, a.val AS aval, b.id AS bid, b.val2 AS bval FROM jc a JOIN jd b ON a.id = b.id ORDER BY a.id
            `);
            expect(r1).to.have.lengthOf(1);
            expect(r1[0]).to.deep.include({ aid: 1, bid: 1, aval: 10, bval: 100 });
        });

        // ---------- LATERAL tests ----------
        it('CROSS JOIN LATERAL with generate_series expands per-row', async () => {
            // expects: (1,1),(1,2),(2,1)  — id=3 with n=0 yields no rows
            const { rows } = await client.query(`
                SELECT t.id, s.val
                FROM lateral_nums t
                CROSS JOIN LATERAL generate_series(1, t.n) AS s(val)
                ORDER BY t.id, s.val
            `);
            expect(rows).to.deep.equal([{ id: 1, val: 1 }, { id: 1, val: 2 }, { id: 2, val: 1 }]);
        });

        it('LEFT JOIN LATERAL keeps outer row when lateral yields nothing', async () => {
            const { rows } = await client.query(`
                SELECT t.id, s.val
                FROM lateral_nums t
                LEFT JOIN LATERAL generate_series(1, t.n) AS s(val) ON true
                ORDER BY t.id, s.val
            `);
            // rows should include id=3 with val = null
            const grouped = rows.reduce((acc, r) => {
                (acc[r.id] || (acc[r.id] = [])).push(r.val);
                return acc;
            }, {});
            expect(grouped[1]).to.deep.equal([1, 2]);
            expect(grouped[2]).to.deep.equal([1]);
            expect(grouped[3]).to.deep.equal([null]);
        });

        it('LATERAL subquery can reference outer columns', async () => {
            const { rows } = await client.query(`
                SELECT t.id, sub.dbl FROM lateral_nums t
                JOIN LATERAL (SELECT t.n * 2 AS dbl) sub ON true
                ORDER BY t.id
            `);
            // each outer row should have dbl = n*2
            expect(rows).to.deep.equal([{ id: 1, dbl: 4 }, { id: 2, dbl: 2 }, { id: 3, dbl: 0 }]);
        });

        it('LATERAL with ROWS FROM and WITH ORDINALITY interplay', async () => {
            // combine a function (generate_series) with unnest in ROWS FROM, lateralized
            const { rows } = await client.query(`
                SELECT t.id, r.x, r.y, r.ordinal 
                FROM lateral_nums t
                CROSS JOIN LATERAL ROWS FROM (
                generate_series(1, t.n),
                unnest(ARRAY['u','v','w']) -- this will be padded/zip behaviour per engine
                ) WITH ORDINALITY AS r(x, y, ordinal)
                WHERE t.n > 0
                ORDER BY t.id, r.ordinal
            `)
            expect(rows.every(r => 'x' in r && 'y' in r && 'ordinal' in r)).to.be.true;
        });
    });

    describe("SELECT - Ordering & Pagination", () => {
        let client, namespaceName = 'lq_test_dgl', t1 = "t1_ordering";

        before(async () => {
            client = await createClient(namespaceName);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);
            // tables
            await client.query(`CREATE TABLE ${t1} (id INT, val TEXT)`);
            await client.query(`
                INSERT INTO ${t1} (id, val) VALUES
                (1, 'b'), (2, 'a'), (3, NULL), (4, 'c')
            `);
        });

        it("should order ascending by a column", async () => {
            const { rows } = await client.query(`SELECT val FROM ${t1} ORDER BY val ASC`);
            expect(rows.map(r => r.val)).to.deep.equal(["a", "b", "c", null]);
        });

        it("should order descending by a column", async () => {
            const { rows } = await client.query(`SELECT val FROM ${t1} ORDER BY val DESC`);
            expect(rows.map(r => r.val)).to.deep.equal([null, "c", "b", "a"]);
        });

        it("should order by multiple columns", async () => {
            const { rows } = await client.query(`
                SELECT * FROM ${t1} ORDER BY (val IS NULL), val
            `);
            expect(rows.map(r => r.val)).to.deep.equal(["a", "b", "c", null]);
        });

        it("should order by an expression", async () => {
            const { rows } = await client.query(`
                SELECT id, id * 2 AS doubled FROM ${t1} ORDER BY doubled DESC
            `);
            expect(rows.map(r => r.doubled)).to.deep.equal([8, 6, 4, 2]);
        });

        it("should order by column position", async () => {
            const { rows } = await client.query(`
                SELECT id, val FROM ${t1} ORDER BY 2 ASC
            `);
            expect(rows.map(r => r.val)).to.deep.equal(["a", "b", "c", null]);
        });

        it("should support NULLS FIRST / LAST", async () => {
            const { rows: rowsFirst } = await client.query(`
                SELECT val FROM ${t1} ORDER BY val NULLS FIRST
            `);
            expect(rowsFirst[0].val).to.be.null;

            const { rows: rowsLast } = await client.query(`
                SELECT val FROM ${t1} ORDER BY val NULLS LAST
            `);
            expect(rowsLast[3].val).to.be.null;
        });

        it("should limit result count", async () => {
            const { rows } = await client.query(`SELECT id FROM ${t1} ORDER BY id LIMIT 2`);
            expect(rows.map(r => r.id)).to.deep.equal([1, 2]);
        });

        it("should offset rows", async () => {
            const { rows } = await client.query(`SELECT id FROM ${t1} ORDER BY id OFFSET 2`);
            expect(rows.map(r => r.id)).to.deep.equal([3, 4]);
        });

        it("should combine LIMIT and OFFSET", async () => {
            const { rows } = await client.query(`SELECT id FROM ${t1} ORDER BY id LIMIT 1 OFFSET 2`);
            expect(rows.map(r => r.id)).to.deep.equal([3]);
        });
    });
    describe("SELECT - Grouping & Aggregation", () => {
        let client, namespaceName = 'lq_test_dgl', t2 = "t2_grouping";

        before(async () => {
            client = await createClient(namespaceName);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);
            // tables
            await client.query(`CREATE TABLE ${t2} (category TEXT, amount INT)`);
            await client.query(`
                INSERT INTO ${t2} (category, amount) VALUES
                ('a', 10), ('a', 20), ('b', 5), ('b', 15), ('c', NULL)
            `);
        });

        it("should count rows", async () => {
            const { rows } = await client.query(`SELECT COUNT(*) AS cnt FROM ${t2}`);
            expect(rows).to.deep.equal([{ cnt: 5 }]);
        });

        it("should aggregate with SUM", async () => {
            const { rows } = await client.query(`SELECT SUM(amount) AS total FROM ${t2}`);
            expect(rows).to.deep.equal([{ total: 50 }]);
        });

        it("should group by a column", async () => {
            const { rows } = await client.query(`
                SELECT category, COUNT(*) AS cnt 
                FROM ${t2} 
                GROUP BY category 
                ORDER BY category
            `);
            expect(rows).to.deep.equal([
                { category: "a", cnt: 2 },
                { category: "b", cnt: 2 },
                { category: "c", cnt: 1 },
            ]);
        });

        it("should group by an expression", async () => {
            const { rows } = await client.query(`
                SELECT (amount % 2 = 0) AS even, COUNT(*) AS cnt
                FROM ${t2} 
                WHERE amount IS NOT NULL
                GROUP BY even 
                ORDER BY even
            `);
            expect(rows).to.deep.equal([
                { even: false, cnt: 2 },
                { even: true, cnt: 2 },
            ]);
        });

        it("should group by column position", async () => {
            const { rows } = await client.query(`
                SELECT category, COUNT(*) AS cnt 
                FROM ${t2} 
                GROUP BY 1 
                ORDER BY category
            `);
            expect(rows).to.deep.equal([
                { category: "a", cnt: 2 },
                { category: "b", cnt: 2 },
                { category: "c", cnt: 1 },
            ]);
        });

        it("should filter groups with HAVING", async () => {
            const { rows } = await client.query(`
                SELECT category, SUM(amount) AS total
                FROM ${t2} 
                GROUP BY category 
                HAVING SUM(amount) > 25
                ORDER BY category
            `);
            expect(rows).to.deep.equal([{ category: "a", total: 30 }]);
        });

        it("should support GROUPING SETS", async () => {
            const { rows } = await client.query(`
                SELECT category, SUM(amount) AS total
                FROM ${t2}
                GROUP BY GROUPING SETS ((category), ())
                ORDER BY category NULLS LAST
            `);
            // Expect per-category totals plus grand total
            expect(rows).to.deep.include.members([
                { category: "a", total: 30 },
                { category: "b", total: 20 },
                { category: "c", total: null }, // or sum if engine handles nulls
                { category: null, total: 50 }   // grand total
            ]);
        });

        it("should support CUBE", async () => {
            const { rows } = await client.query(`
                SELECT category, SUM(amount) AS total
                FROM ${t2}
                GROUP BY CUBE(category)
                ORDER BY category NULLS LAST
            `);
            expect(rows.map(r => r.total)).to.include(50);
        });

        it("should support ROLLUP", async () => {
            const { rows } = await client.query(`
                SELECT category, SUM(amount) AS total
                FROM ${t2}
                GROUP BY ROLLUP(category)
                ORDER BY category NULLS LAST
            `);
            expect(rows.map(r => r.total)).to.include(50);
        });

        it("should group by multiple columns", async () => {
            const { rows } = await client.query(`
                SELECT category, amount, COUNT(*) AS cnt
                FROM ${t2}
                GROUP BY category, amount
                ORDER BY category, amount
            `);
            expect(rows).to.deep.equal([
                { category: "a", amount: 10, cnt: 1 },
                { category: "a", amount: 20, cnt: 1 },
                { category: "b", amount: 5, cnt: 1 },
                { category: "b", amount: 15, cnt: 1 },
                { category: "c", amount: null, cnt: 1 },
            ]);
        });

        it("should support HAVING on aggregate alias", async () => {
            const { rows } = await client.query(`
                SELECT category, SUM(amount) AS total
                FROM ${t2}
                GROUP BY category
                HAVING SUM(amount) >= 20
                ORDER BY category
            `);
            expect(rows).to.deep.equal([
                { category: "a", total: 30 },
                { category: "b", total: 20 },
            ]);
        });

        it("should allow GROUP BY with window functions", async () => {
            const { rows } = await client.query(`
                SELECT category,
                    COUNT(*) AS cnt,
                    SUM(amount) OVER () AS grand_total
                FROM ${t2}
                GROUP BY category
                ORDER BY category
            `);
            expect(rows).to.deep.equal([
                { category: "a", cnt: 2, grand_total: 15 },
                { category: "b", cnt: 2, grand_total: 15 },
                { category: "c", cnt: 1, grand_total: 15 },
            ]);
        });
    });


    describe("SELECT - Subqueries", () => {
        let client, namespaceName = 'lq_test_dgl', t3 = "t3_subq", t4 = "nums";

        before(async () => {
            client = await createClient(namespaceName);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);
            // tables
            await client.query(`CREATE TABLE ${t3} (id INT, val TEXT)`);
            await client.query(`INSERT INTO ${t3} (id, val) VALUES (1, 'a'), (2, 'b'), (3, 'c')`);
            await client.query(`CREATE TABLE ${t4} (id INT PRIMARY KEY, val INT)`);
            await client.query(`INSERT INTO ${t4} (id, val) VALUES (1, 10), (2, 20), (3, 30)`);
        });

        it("should use a scalar subquery in SELECT list", async () => {
            const { rows } = await client.query(`
                SELECT id, (SELECT MAX(id) FROM ${t3}) AS max_id FROM ${t3} ORDER BY id
            `);
            expect(rows.map(r => r.max_id)).to.deep.equal([3, 3, 3]);
        });

        it("should use a subquery in WHERE with IN", async () => {
            const { rows } = await client.query(`
                SELECT id FROM ${t3} WHERE val IN (SELECT val FROM ${t3} WHERE id < 3)
            `);
            expect(rows.map(r => r.id)).to.deep.equal([1, 2]);
        });

        it("should use a subquery with EXISTS", async () => {
            const { rows } = await client.query(`
                SELECT id FROM ${t3} t WHERE EXISTS (SELECT 1 FROM ${t3} WHERE val = t.val)
            `);
            expect(rows.map(r => r.id)).to.deep.equal([1, 2, 3]);
        });

        it("should use a correlated subquery", async () => {
            const { rows } = await client.query(`
                SELECT id, val FROM ${t3} t
                WHERE id = (SELECT MAX(id) FROM ${t3} WHERE val <= t.val)
            `);
            expect(rows.map(r => r.id)).to.deep.equal([1, 2, 3]);
        });

        it("should evaluate = ANY(subquery)", async () => {
            const { rows } = await client.query(`
                SELECT 15 = ANY(SELECT val FROM ${t4}) AS match_any,
                20 = ANY(SELECT val FROM ${t4}) AS match_any_20
        `   );
            expect(rows[0].match_any).to.be.false;
            expect(rows[0].match_any_20).to.be.true;
        });

        it("should evaluate > ALL(subquery)", async () => {
            const { rows } = await client.query(`
                SELECT 40 > ALL(SELECT val FROM ${t4}) AS greater_all,
                25 > ALL(SELECT val FROM ${t4}) AS not_greater
            `);
            expect(rows[0].greater_all).to.be.true;       // 40 > 10,20,30
            expect(rows[0].not_greater).to.be.false;      // 25 > 30? false
        });

        it("should evaluate < ANY(subquery)", async () => {
            const { rows } = await client.query(`
                SELECT 5 < ANY(SELECT val FROM ${t4}) AS less_any,
                5 < ALL(SELECT val FROM ${t4}) AS less_all
            `);
            expect(rows[0].less_any).to.be.true;   // 5 < 10, true
            expect(rows[0].less_all).to.be.true;   // 5 < all of 10,20,30
        });

        it("should select from a nested subquery", async () => {
            const { rows } = await client.query(`
                SELECT * FROM (SELECT * FROM (SELECT id FROM ${t3}) AS inner1) AS inner2
            `);
            expect(rows.map(r => r.id)).to.deep.equal([1, 2, 3]);
        });
    });
});

describe("FlashQL - CTEs", () => {
    describe("SELECT - CTEs", () => {
        let client, namespaceName = 'lq_test_dgl', t3 = "t3_cte", t4 = "nums_cte";

        before(async () => {
            client = await createClient(namespaceName);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);

            await client.query(`CREATE TABLE ${t3} (id INT, val TEXT)`);
            await client.query(`INSERT INTO ${t3} (id, val) VALUES (1, 'a'), (2, 'b'), (3, 'c')`);

            await client.query(`CREATE TABLE ${t4} (id INT PRIMARY KEY, val INT)`);
            await client.query(`INSERT INTO ${t4} (id, val) VALUES (1, 10), (2, 20), (3, 30)`);
        });

        it("should support a simple CTE", async () => {
            const { rows } = await client.query(`
            WITH cte AS (SELECT id, val FROM ${t3})
            SELECT * FROM cte ORDER BY id
        `);
            expect(rows).to.deep.eq([
                { id: 1, val: "a" },
                { id: 2, val: "b" },
                { id: 3, val: "c" }
            ]);
        });

        it("should support multiple CTEs", async () => {
            const { rows } = await client.query(`
            WITH cte1 AS (SELECT id FROM ${t3}),
                 cte2 AS (SELECT val FROM ${t3} WHERE id = 1)
            SELECT cte1.id, cte2.val FROM cte1, cte2 ORDER BY cte1.id
        `);
            expect(rows).to.deep.eq([
                { id: 1, val: "a" },
                { id: 2, val: "a" },
                { id: 3, val: "a" }
            ]);
        });

        it("should allow a CTE with aggregation", async () => {
            const { rows } = await client.query(`
            WITH totals AS (SELECT val, COUNT(*) AS cnt FROM ${t3} GROUP BY val)
            SELECT * FROM totals ORDER BY val
        `);
            expect(rows).to.deep.eq([
                { val: "a", cnt: 1 },
                { val: "b", cnt: 1 },
                { val: "c", cnt: 1 }
            ]);
        });

        it("should allow a CTE in a JOIN", async () => {
            const { rows } = await client.query(`
            WITH cte AS (SELECT id, val FROM ${t3})
            SELECT t.id, t.val FROM ${t3} t
            JOIN cte c ON t.id = c.id
            ORDER BY t.id
        `);
            expect(rows).to.deep.eq([
                { id: 1, val: "a" },
                { id: 2, val: "b" },
                { id: 3, val: "c" }
            ]);
        });

        it("should allow a CTE with a WHERE condition", async () => {
            const { rows } = await client.query(`
            WITH cte AS (SELECT * FROM ${t3} WHERE id > 1)
            SELECT * FROM cte ORDER BY id
        `);
            expect(rows).to.deep.eq([
                { id: 2, val: "b" },
                { id: 3, val: "c" }
            ]);
        });

        it("should allow referencing a CTE multiple times", async () => {
            const { rows } = await client.query(`
            WITH cte AS (SELECT id FROM ${t3} WHERE id <= 2)
            SELECT COUNT(*) AS cnt FROM cte
        `);
            expect(rows).to.deep.eq([
                { cnt: 2 }
            ]);
        });
    });
});

describe("INSERT - SELECT", () => {
    let client, namespaceName = 'lq_test_dml_dgl', src = "src_tbl", dest = "dest_tbl";

    before(async () => {
        client = await createClient(namespaceName);
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);

        await client.query(`DROP TABLE IF EXISTS ${src}`);
        await client.query(`DROP TABLE IF EXISTS ${dest}`);

        await client.query(`CREATE TABLE ${src} (id INT, val TEXT)`);
        await client.query(`CREATE TABLE ${dest} (id INT, val TEXT)`);

        await client.query(`
            INSERT INTO ${src} (id, val) 
            VALUES (1, 'a'), (2, 'b'), (3, 'c')
        `);
    });

    it("should insert all rows from a SELECT", async () => {
        await client.query(`
            INSERT INTO ${dest} (id, val)
            SELECT id, val FROM ${src}
        `);

        const { rows } = await client.query(`SELECT * FROM ${dest} ORDER BY id`);
        expect(rows).to.deep.eq([
            { id: 1, val: "a" },
            { id: 2, val: "b" },
            { id: 3, val: "c" },
        ]);
    });

    it("should insert with a filtered SELECT", async () => {
        await client.query(`DELETE FROM ${dest}`);
        await client.query(`
            INSERT INTO ${dest} (id, val)
            SELECT id, val FROM ${src} WHERE id > 1
        `);

        const { rows } = await client.query(`SELECT * FROM ${dest} ORDER BY id`);
        expect(rows).to.deep.eq([
            { id: 2, val: "b" },
            { id: 3, val: "c" },
        ]);
    });

    it("should insert with computed columns", async () => {
        await client.query(`DELETE FROM ${dest}`);
        await client.query(`
            INSERT INTO ${dest} (id, val)
            SELECT id * 10, val || '_x' FROM ${src}
        `);

        const { rows } = await client.query(`SELECT * FROM ${dest} ORDER BY id`);
        expect(rows).to.deep.eq([
            { id: 10, val: "a_x" },
            { id: 20, val: "b_x" },
            { id: 30, val: "c_x" },
        ]);
    });

    it("should insert with aggregation in SELECT", async () => {
        await client.query(`DELETE FROM ${dest}`);
        await client.query(`
            INSERT INTO ${dest} (id, val)
            SELECT COUNT(*), 'total' FROM ${src}
        `);

        const { rows } = await client.query(`SELECT * FROM ${dest}`);
        expect(rows).to.deep.eq([
            { id: 3, val: "total" },
        ]);
    });

    it("should insert with a subquery in SELECT", async () => {
        await client.query(`DELETE FROM ${dest}`);
        await client.query(`
            INSERT INTO ${dest} (id, val)
            SELECT id, (SELECT MAX(id) FROM ${src})::text FROM ${src}
        `);

        const { rows } = await client.query(`SELECT * FROM ${dest} ORDER BY id`);
        expect(rows).to.deep.eq([
            { id: 1, val: "3" },
            { id: 2, val: "3" },
            { id: 3, val: "3" },
        ]);
    });
});

describe("DML - RETURNING", () => {
    let client, namespaceName = 'lq_test_dgl', tbl = "tbl_ret";

    before(async () => {
        client = await createClient(namespaceName);
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);

        await client.query(`DROP TABLE IF EXISTS ${tbl}`);
        await client.query(`CREATE TABLE ${tbl} (id INT PRIMARY KEY, val TEXT)`);

        await client.query(`
            INSERT INTO ${tbl} (id, val) VALUES 
            (1, 'a'), (2, 'b'), (3, 'c')
        `);
    });

    it("should return inserted rows", async () => {
        const { rows } = await client.query(`
            INSERT INTO ${tbl} (id, val)
            VALUES (4, 'd'), (5, 'e')
            RETURNING id, val
        `);

        expect(rows).to.deep.eq([
            { id: 4, val: "d" },
            { id: 5, val: "e" },
        ]);
    });

    it("should return updated rows", async () => {
        const { rows } = await client.query(`
            UPDATE ${tbl}
            SET val = val || '_x'
            WHERE id <= 2
            RETURNING id, val
        `);

        expect(rows).to.deep.eq([
            { id: 1, val: "a_x" },
            { id: 2, val: "b_x" },
        ]);
    });

    it("should return deleted rows", async () => {
        const { rows } = await client.query(`
            DELETE FROM ${tbl}
            WHERE id = 3
            RETURNING id, val
        `);

        expect(rows).to.deep.eq([
            { id: 3, val: "c" },
        ]);
    });

    it("should allow expressions in RETURNING", async () => {
        const { rows } = await client.query(`
            INSERT INTO ${tbl} (id, val)
            VALUES (6, 'z')
            RETURNING id * 10 AS id_times_10, upper(val) AS upper_val
        `);

        expect(rows).to.deep.eq([
            { id_times_10: 60, upper_val: "Z" },
        ]);
    });

    it("should return no rows when UPDATE matches nothing", async () => {
        const { rows } = await client.query(`
            UPDATE ${tbl}
            SET val = 'none'
            WHERE id = 999
            RETURNING id, val
        `);

        expect(rows).to.deep.eq([]); // nothing matched
    });
});

describe("DML - RETURNING with CTEs and ROW_NUMBER", () => {
    let client, namespaceName = 'lq_test_dgl', tbl = "tbl_ret";

    before(async () => {
        client = await createClient(namespaceName);
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);

        await client.query(`DROP TABLE IF EXISTS ${tbl}`);
        await client.query(`CREATE TABLE ${tbl} (id INT PRIMARY KEY, val TEXT)`);

        await client.query(`
            INSERT INTO ${tbl} (id, val) VALUES 
            (1, 'a'), (2, 'b'), (3, 'c')
        `);
    });

    it("CTE with INSERT ... RETURNING + SELECT with ROW_NUMBER", async () => {
        const { rows } = await client.query(`
            WITH inserted AS (
                INSERT INTO ${tbl} (id, val)
                VALUES (4, 'd'), (5, 'e')
                RETURNING id, val
            ), sel AS (
                SELECT 
                    id, val,
                    ROW_NUMBER() OVER (ORDER BY id) AS rn
                FROM inserted
            )
            SELECT * FROM sel
        `);

        expect(rows).to.deep.eq([
            { id: 4, val: "d", rn: 1 },
            { id: 5, val: "e", rn: 2 }
        ]);
    });

    it("CTE with UPDATE ... RETURNING + SELECT with ROW_NUMBER", async () => {
        const { rows } = await client.query(`
            WITH updated AS (
                UPDATE ${tbl}
                SET val = val || '_x'
                WHERE id <= 2
                RETURNING id, val
            ), sel AS (
                SELECT 
                    id, val,
                    ROW_NUMBER() OVER (ORDER BY val DESC) AS rn
                FROM updated
            )
            SELECT * FROM sel
        `);

        expect(rows).to.deep.eq([
            { id: 1, val: "a_x", rn: 2 },
            { id: 2, val: "b_x", rn: 1 },
        ]);
    });

    it("CTE with DELETE ... RETURNING + SELECT with ROW_NUMBER", async () => {
        const { rows } = await client.query(`
            WITH deleted AS (
                DELETE FROM ${tbl}
                WHERE id = 3
                RETURNING id, val
            ), sel AS (
                SELECT 
                    id, val,
                    ROW_NUMBER() OVER () AS rn
                FROM deleted
            )
            SELECT * FROM sel
        `);

        expect(rows).to.deep.eq([
            { id: 3, val: "c", rn: 1 }
        ]);
    });

    it("CTE with expressions in RETURNING + SELECT with ROW_NUMBER", async () => {
        const { rows } = await client.query(`
            WITH inserted AS (
                INSERT INTO ${tbl} (id, val)
                VALUES (6, 'z')
                RETURNING id * 10 AS id_times_10, upper(val) AS upper_val
            ), sel AS (
                SELECT 
                    id_times_10, upper_val,
                    ROW_NUMBER() OVER (ORDER BY id_times_10 DESC) AS rn
                FROM inserted
            )
            SELECT * FROM sel
        `);

        expect(rows).to.deep.eq([
            { id_times_10: 60, upper_val: "Z", rn: 1 }
        ]);
    });

    it("CTE with UPDATE matching nothing + SELECT with ROW_NUMBER", async () => {
        const { rows } = await client.query(`
            WITH updated AS (
                UPDATE ${tbl}
                SET val = 'none'
                WHERE id = 999
                RETURNING id, val
            ), sel AS (
                SELECT 
                    id, val,
                    ROW_NUMBER() OVER () AS rn
                FROM updated
            )
            SELECT * FROM sel
        `);

        expect(rows).to.deep.eq([]); // nothing matched
    });
});
describe("ROW_NUMBER ordering", () => {
    let client, namespaceName = 'lq_test_rownum';

    before(async () => {
        client = await createClient(namespaceName);
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);
    });

    it("should order rows by val DESC for ROW_NUMBER", async () => {
        const { rows } = await client.query(`
            WITH data AS (
                SELECT id, val
                FROM (VALUES
                    (1, 'apple'),
                    (2, 'banana'),
                    (3, 'cherry')
                ) AS t(id, val)
            ), numbered AS (
                SELECT
                    id,
                    val,
                    ROW_NUMBER() OVER (ORDER BY val DESC) AS rn
                FROM data
            )
            SELECT id, val, rn
            FROM numbered
            ORDER BY rn;
        `);

        expect(rows).to.deep.eq([
            { id: 3, val: "cherry", rn: 1 },
            { id: 2, val: "banana", rn: 2 },
            { id: 1, val: "apple", rn: 3 }
        ]);
    });

    it("should order rows by val DESC with tie-breaker stability", async () => {
        const { rows } = await client.query(`
            WITH data AS (
                SELECT id, val
                FROM (VALUES
                    (1, 'apple'),
                    (2, 'apple'),
                    (3, 'banana'),
                    (4, 'banana'),
                    (5, 'cherry')
                ) AS t(id, val)
            ), numbered AS (
                SELECT
                    id,
                    val,
                    ROW_NUMBER() OVER (ORDER BY val DESC, id ASC) AS rn
                FROM data
            )
            SELECT id, val, rn
            FROM numbered
            ORDER BY rn;
        `);

        expect(rows).to.deep.eq([
            { id: 5, val: "cherry", rn: 1 },
            { id: 3, val: "banana", rn: 2 },
            { id: 4, val: "banana", rn: 3 },
            { id: 1, val: "apple", rn: 4 },
            { id: 2, val: "apple", rn: 5 }
        ]);
    });
});

describe("SET OPERATIONS - UNION / INTERSECT / EXCEPT", () => {
    let client, namespaceName = 'lq_test_setops', tblA = "tbl_a", tblB = "tbl_b";

    before(async () => {
        client = await createClient(namespaceName, { defaultPrimaryKey: null });
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespaceName}`);

        await client.query(`DROP TABLE IF EXISTS ${tblA}`);
        await client.query(`DROP TABLE IF EXISTS ${tblB}`);

        await client.query(`CREATE TABLE ${tblA} (id INT, val TEXT)`);
        await client.query(`CREATE TABLE ${tblB} (id INT, val TEXT)`);

        await client.query(`
            INSERT INTO ${tblA} (id, val)
            VALUES (1, 'a'), (2, 'b'), (3, 'c'), (3, 'c'), (1, 'a')
        `);

        await client.query(`
            INSERT INTO ${tblB} (id, val)
            VALUES (2, 'b'), (3, 'c'), (4, 'd'), (3, 'c')
        `);
    });

    it("UNION DISTINCT should deduplicate combined results", async () => {
        const { rows } = await client.query(`
            SELECT id, val FROM ${tblA}
            UNION
            SELECT id, val FROM ${tblB}
            ORDER BY id;
        `);

        expect(rows).to.deep.eq([
            { id: 1, val: "a" },
            { id: 2, val: "b" },
            { id: 3, val: "c" },
            { id: 4, val: "d" }
        ]);
    });

    it("UNION ALL should preserve duplicates", async () => {
        const { rows } = await client.query(`
            SELECT id, val FROM ${tblA}
            UNION ALL
            SELECT id, val FROM ${tblB}
            WHERE id <= 3
            ORDER BY id, val;
        `);

        expect(rows).to.have.length(8);
        expect(rows.filter(r => r.id === 3)).to.have.length(4);
    });

    it("INTERSECT DISTINCT should keep only shared rows", async () => {
        const { rows } = await client.query(`
            SELECT id, val FROM ${tblA}
            INTERSECT
            SELECT id, val FROM ${tblB}
            ORDER BY id;
        `);

        expect(rows).to.deep.eq([
            { id: 2, val: "b" },
            { id: 3, val: "c" }
        ]);
    });

    it("INTERSECT ALL should retain multiplicities", async () => {
        const { rows } = await client.query(`
            SELECT id, val FROM ${tblA}
            INTERSECT ALL
            SELECT id, val FROM ${tblB}
            WHERE id IN (3)
            ORDER BY id;
        `);

        expect(rows).to.deep.eq([
            { id: 3, val: 'c' },
            { id: 3, val: 'c' }
        ]);
    });

    it("EXCEPT DISTINCT should remove right-hand matches", async () => {
        const { rows } = await client.query(`
            SELECT id, val FROM ${tblA}
            EXCEPT
            SELECT id, val FROM ${tblB}
            ORDER BY id;
        `);

        expect(rows).to.deep.eq([
            { id: 1, val: "a" }
        ]);
    });

    it("EXCEPT ALL should subtract multiplicities", async () => {
        const { rows } = await client.query(`
            SELECT id, val FROM ${tblA}
            EXCEPT ALL
            SELECT id, val FROM ${tblB}
            WHERE id = 3
            ORDER BY id;
        `);

        // After removing two (3,'c') from both, left still has one (1,'a'), one (2,'b')
        expect(rows.some(r => r.id === 1)).to.be.true;
    });

    it("UNION with VALUES operand", async () => {
        const { rows } = await client.query(`
            SELECT id, val FROM ${tblA} WHERE id < 2
            UNION
            (VALUES (2, 'b'), (5, 'e'))
            ORDER BY id;
        `);

        expect(rows).to.deep.eq([
            { id: 1, val: "a" },
            { id: 2, val: "b" },
            { id: 5, val: "e" }
        ]);
    });

    it("EXCEPT between TABLE and VALUES", async () => {
        const { rows } = await client.query(`
            TABLE ${tblB}
            EXCEPT
            (VALUES (3, 'c'))
            ORDER BY id;
        `);

        expect(rows).to.deep.eq([
            { id: 2, val: "b" },
            { id: 4, val: "d" }
        ]);
    });

    it("ORDER BY ordinal should work after UNION", async () => {
        globalThis._ = 3;
        const { rows } = await client.query(`
            SELECT 1 AS id, 'x' AS val
            UNION
            SELECT 3, 'z'
            UNION
            SELECT 2, 'y'
            ORDER BY 1 DESC;
        `);
        globalThis._ = 0;

        expect(rows.map(r => r.id)).to.deep.eq([3, 2, 1]);
    });

    it("ORDER BY alias should work on composite results", async () => {
        const { rows } = await client.query(`
            SELECT 1 AS id, 'x' AS val
            UNION
            SELECT 2, 'y'
            ORDER BY val DESC;
        `);

        expect(rows.map(r => r.val)).to.deep.eq(['y', 'x']);
    });

    it("LIMIT and OFFSET should apply after ORDER BY", async () => {
        const { rows } = await client.query(`
            SELECT 1 AS id UNION SELECT 2 UNION SELECT 3
            ORDER BY id
            LIMIT 2 OFFSET 1;
        `);

        expect(rows).to.deep.eq([
            { id: 2 },
            { id: 3 }
        ]);
    });

    it("Parenthesized set operations should nest correctly", async () => {
        const { rows } = await client.query(`
            (SELECT 1 AS id UNION SELECT 2)
            INTERSECT
            (SELECT 2 UNION SELECT 3)
            ORDER BY id;
        `);

        expect(rows).to.deep.eq([{ id: 2 }]);
    });

    it("Should throw error on column count mismatch", async () => {
        await expect(client.query(`
            SELECT 1 AS a
            UNION
            SELECT 1, 2;
        `)).to.be.rejectedWith(/column mismatch/i);
    });
});
