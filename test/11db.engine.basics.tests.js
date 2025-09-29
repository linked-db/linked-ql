import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { matchSchemaSelector, normalizeSchemaSelectorArg } from '../src/db/abstracts/util.js';
import { StorageEngine } from '../src/db/local/StorageEngine.js';
import { LocalDriver } from '../src/db/local/LocalDriver.js';
import { registry } from '../src/lang/registry.js';

describe('Util', () => {

    it('should normalize selector forms', () => {
        expect(() => normalizeSchemaSelectorArg()).to.throw(/Given selector .* invalid/);
        expect(() => normalizeSchemaSelectorArg(null)).to.throw(/Given selector .* invalid/);
        expect(() => normalizeSchemaSelectorArg({})).to.throw(/Given selector .* invalid/);

        expect(() => normalizeSchemaSelectorArg([{ schema: 'b' }, { a: 'b' }])).to.throw(/Given selector .* invalid at index 1/);

        const a = normalizeSchemaSelectorArg('*');
        expect(a).to.deep.eq({ ['*']: ['*'] });
        const b = normalizeSchemaSelectorArg({ a: 'b' });
        expect(b).to.deep.eq({ a: ['b'] });
        const c = normalizeSchemaSelectorArg([{ schema: 'b' }]);
        expect(c).to.deep.eq({ b: ['*'] });
    });

    it('should match plain db selector', () => {
        const a = matchSchemaSelector('lq_test_public', ['lq_test_public', 'lq_test_private']);
        const b = matchSchemaSelector('lq_test_public', ['lq_test_public2', 'lq_test_private']);
        expect(a).to.be.true;
        expect(b).to.be.false;
    });

    it('should match negated plain db selector', () => {
        const a = matchSchemaSelector('lq_test_public', ['!lq_test_public', 'lq_test_private']);
        const b = matchSchemaSelector('lq_test_public', ['!lq_test_public2', 'lq_test_public']);
        const c = matchSchemaSelector('lq_test_public', ['!lq_test_public2', '!lq_test_private']);
        expect(a).to.be.false;
        expect(b).to.be.true;
        expect(c).to.be.true;
    });

    it('should match wildcard db selector', () => {
        const a = matchSchemaSelector('lq_test_public', ['%ublic', 'lq_test_private']);
        const b = matchSchemaSelector('lq_test_public', ['publi%']);
        const c = matchSchemaSelector('lq_test_public', ['publo%']);
        expect(a).to.be.true;
        expect(b).to.be.true;
        expect(c).to.be.false;
    });

    it('should match negated wildcard db selector', () => {
        const a = matchSchemaSelector('lq_test_public', ['!%ublic', 'lq_test_private']);
        const b = matchSchemaSelector('lq_test_public', ['!publi%']);
        const c = matchSchemaSelector('lq_test_public', ['!publo%']);
        expect(a).to.be.false;
        expect(b).to.be.false;
        expect(c).to.be.true;
    });
});

describe('StorageEngine - Basic CRUD', () => {
    let storageEngine;

    describe('SCHEMA', () => {
        it('should create basic table schema', async () => {
            storageEngine = new StorageEngine({ defaultSchemaName: 'lq_test_public' });
            await storageEngine.createSchema('lq_test_public');

            const createTableSuccess = await storageEngine.createTable('tbl1');
            expect(createTableSuccess).to.be.true;
        });

        it('should reject creating an existing table schema', async () => {
            expect(storageEngine.createTable('tbl1')).to.be.rejected;
        });

        it('should retrieve just-created table schema', async () => {
            const tableNames = await storageEngine.tableNames();
            expect(tableNames).to.include('tbl1');

            const tblSchema = await storageEngine.tableSchema('tbl1');
            expect(tblSchema).to.be.an('object');

            const pkCols = await storageEngine.tableKeyColumns('tbl1');
            expect(pkCols).to.be.an('array').with.length(1);
        });
    });

    describe('INSERT', () => {
        it('should do basic INSERT', async () => {
            const row = await storageEngine.insert('tbl1', { id: 34, name: 'John' });
            expect(row).to.deep.eq({ id: 34, name: 'John' });
        });

        it('should reject duplicate-key INSERT', async () => {
            expect(storageEngine.insert('tbl1', { id: 34, name: 'John' })).to.be.rejected;
        });

        it('should do auto-increment', async () => {
            const row1 = await storageEngine.insert('tbl1', { name: 'John' });
            expect(row1).to.deep.eq({ name: 'John', id: 1 });

            const row2 = await storageEngine.insert('tbl1', { name: 'John' });
            expect(row2).to.deep.eq({ name: 'John', id: 2 });
        });
    });

    describe('UPDATE', () => {
        it('should do basic UPDATE', async () => {
            const row = await storageEngine.update('tbl1', { id: 34, name: 'John2' });
            expect(row).to.deep.eq({ id: 34, name: 'John2' });
        });
    });

    describe('READ', () => {
        it('should do basic READ', async () => {
            const record = await storageEngine.fetch('tbl1', { id: 34 });
            expect(record).to.deep.eq({ id: 34, name: 'John2' });
        });

        it('should do basic scan', async () => {
            const records = await storageEngine.getCursor('tbl1');
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
            const row = await storageEngine.delete('tbl1', { id: 34 });
            expect(row).to.deep.eq({ id: 34, name: 'John2' });

            const record = await storageEngine.fetch('tbl1', { id: 34 });
            expect(record).to.be.undefined;
        });
    });
});

describe('LocalDriver - Basic DDL', () => {
    let driver;

    before(async () => {
        driver = new LocalDriver;
        await driver.connect();
    });

    after(async () => {
        await driver.disconnect();
    });

    // You can always infer things:
    // get schema names - await driver.storageEngine.schemaNames(): array
    // get schema - await driver.storageEngine.getSchema(): { schemas: registry.SchemaSchema, storage: Map, counters: Map }
    // get table names - await driver.storageEngine.tableNames(schemaName | <default schemaName>): array
    // get table storage - await driver.storageEngine.tableStorage(tableName, schemaName | <default schemaName>): Map // keyed by record id/hash
    // get table schema - await driver.storageEngine.tableSchema(tableName, schemaName | <default schemaName>): registry.TableSchema
    // get table primary key columns - await driver.storageEngine.tableKeyColumns(tableName, schemaName | <default schemaName>): <registry.ColumnSchema>[]

    // ---------- CREATE/DROP

    describe('CREATE SCHEMA', () => {
        it('should create schema with IF NOT EXISTS', async () => {
            const result = await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_schema');
            expect(result).to.exist;
            const schemas = await driver.storageEngine.schemaNames();
            expect(schemas).to.include('lq_test_schema');
        });

        it('should not create schema if already exists', async () => {
            await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_schema');
            await expect(driver.query('CREATE SCHEMA lq_test_schema')).to.be.rejected;
        });

        // Advanced: create schema with AUTHORIZATION (Postgres syntax)
        it('should support CREATE SCHEMA ... AUTHORIZATION', async () => {
            const result = await driver.query('CREATE SCHEMA IF NOT EXISTS lq_auth AUTHORIZATION current_user');
            expect(result).to.exist;
            const schemas = await driver.storageEngine.schemaNames();
            expect(schemas).to.include('lq_auth');
        });
    });

    describe('DROP SCHEMA', () => {
        before(async () => {
            await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_drop');
            await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_drop2');
        });

        it('should drop schema with IF EXISTS', async () => {
            const result = await driver.query('DROP SCHEMA IF EXISTS lq_test_drop CASCADE');
            expect(result).to.exist;
            const schemas = await driver.storageEngine.schemaNames();
            expect(schemas).to.not.include('lq_test_drop');
        });

        it('should not fail dropping non-existent schema', async () => {
            await expect(driver.query('DROP SCHEMA IF EXISTS lq_nonexistent CASCADE')).to.not.be.rejected;
        });

        // Advanced: drop multiple schemas
        it('should drop multiple schemas in one command', async () => {
            await driver.query('CREATE SCHEMA IF NOT EXISTS lq_multi1');
            await driver.query('CREATE SCHEMA IF NOT EXISTS lq_multi2');
            const result = await driver.query('DROP SCHEMA IF EXISTS lq_multi1, lq_multi2 CASCADE');
            expect(result).to.exist;
            const schemas = await driver.storageEngine.schemaNames();
            expect(schemas).to.not.include('lq_multi1');
            expect(schemas).to.not.include('lq_multi2');
        });

        // Advanced: RESTRICT should prevent drop if schema not empty
        it('should reject DROP SCHEMA ... RESTRICT when schema not empty', async () => {
            await driver.query('CREATE SCHEMA IF NOT EXISTS lq_restrict');
            await driver.query('CREATE TABLE IF NOT EXISTS lq_restrict.tbl1 (id INT PRIMARY KEY)');
            await expect(driver.query('DROP SCHEMA lq_restrict RESTRICT')).to.be.rejected;
            const result = await driver.query('DROP SCHEMA lq_restrict CASCADE');
            expect(result).to.exist;
            const schemas = await driver.storageEngine.schemaNames();
            expect(schemas).to.not.include('lq_restrict');
        });
    });

    describe('CREATE TABLE', () => {
        before(async () => {
            await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_table');
        });

        it('should create table in schema', async () => {
            const result = await driver.query('CREATE TABLE lq_test_table.tbl1 (id INT PRIMARY KEY, name TEXT)');
            expect(result).to.exist;
            const tables = await driver.storageEngine.tableNames('lq_test_table');
            expect(tables).to.include('tbl1');
        });

        it('should not create table if already exists', async () => {
            await expect(driver.query('CREATE TABLE lq_test_table.tbl1 (id INT PRIMARY KEY, name TEXT)')).to.be.rejected;
        });

        it('should support IF NOT EXISTS', async () => {
            await expect(driver.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl1 (id INT PRIMARY KEY, name TEXT)')).to.not.be.rejected;
        });

        // Advanced: TEMPORARY keyword should throw on in-mem engine
        it('should throw on CREATE TEMPORARY TABLE', async () => {
            await expect(driver.query('CREATE TEMPORARY TABLE lq_test_table.temp_tbl (id INT)')).to.be.rejected;
        });
    });

    describe('DROP TABLE', () => {
        before(async () => {
            await driver.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl2 (id INT PRIMARY KEY)');
        });

        it('should drop table with IF EXISTS', async () => {
            const result = await driver.query('DROP TABLE IF EXISTS lq_test_table.tbl2');
            expect(result).to.exist;
            const tables = await driver.storageEngine.tableNames('lq_test_table');
            expect(tables).to.not.include('tbl2');
        });

        it('should not fail dropping non-existent table', async () => {
            await expect(driver.query('DROP TABLE IF EXISTS lq_test_table.tbl2')).to.not.be.rejected;
        });

        it('should support dropping multiple tables', async () => {
            await driver.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl3 (id INT PRIMARY KEY)');
            await driver.query('CREATE TABLE IF NOT EXISTS lq_test_table.tbl4 (id INT PRIMARY KEY)');
            const result = await driver.query('DROP TABLE IF EXISTS lq_test_table.tbl3, lq_test_table.tbl4');
            expect(result).to.exist;
            const tables = await driver.storageEngine.tableNames('lq_test_table');
            expect(tables).to.not.include('tbl3');
            expect(tables).to.not.include('tbl4');
        });

        // Advanced: CASCADE should drop dependent objects
        it('should drop table with CASCADE when dependencies exist', async () => {
            await driver.query('CREATE TABLE IF NOT EXISTS lq_test_table.parent (id INT PRIMARY KEY)');
            await driver.query('CREATE TABLE IF NOT EXISTS lq_test_table.child (id INT PRIMARY KEY, pid INT REFERENCES lq_test_table.parent(id))');
            await expect(driver.query('DROP TABLE lq_test_table.parent CASCADE')).to.not.be.rejected;
            const tables = await driver.storageEngine.tableNames('lq_test_table');
            expect(tables).to.not.include('parent');
            //expect(tables).to.not.include('child'); // TODO
        });

        // Advanced: TEMPORARY keyword should throw on in-mem engine
        it('should throw on DROP TEMPORARY TABLE', async () => {
            await expect(driver.query('DROP TEMPORARY TABLE lq_test_table.nonexistent', { dialect: 'mysql' })).to.be.rejected;
        });
    });

    // ---------- ALTER (TODO)
});

describe('LocalDriver - DDL Inference', () => {
    let driver;

    before(async () => {
        driver = new LocalDriver;
        await driver.connect();
    });

    after(async () => {
        await driver.disconnect();
    });

    before(async () => {
        await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_show');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_show.tbl1 (id INT PRIMARY KEY)');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_show.tbl2 (id INT PRIMARY KEY)');

        await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_public');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_public.tbl1 (id INT PRIMARY KEY)');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_public.tbl2 (id INT PRIMARY KEY)');

        await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_private');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_private.tbl1 (id INT PRIMARY KEY)');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_private.tbl2 (id INT PRIMARY KEY)');
    });

    describe('SHOW CREATE', () => {

        it('should show create for schema', async () => {
            const result = await driver.showCreate({ lq_test_show: ['*'] }, true);
            expect(result).to.have.lengthOf(1);
            expect(result[0].name().value()).to.eq('lq_test_show');
            expect(result[0].tables()).to.have.lengthOf(2);
        });

        it('should show create for specific table', async () => {
            const result = await driver.showCreate({ lq_test_show: ['tbl1'] }, true);
            expect(result).to.have.lengthOf(1);
            expect(result[0].tables()).to.have.lengthOf(1);
            expect(result[0].tables()[0].name().value()).to.eq('tbl1');
        });

        it('should show create for negated table', async () => {
            const result = await driver.showCreate({ lq_test_show: ['!tbl1'] }, true);
            expect(result).to.have.lengthOf(1);
            expect(result[0].tables()).to.have.lengthOf(1);
            expect(result[0].tables()[0].name().value()).to.eq('tbl2');
        });

        it('should show create for wildcard schema', async () => {
            const result = await driver.showCreate({ ['*']: ['tbl1'] }, true);
            expect(result.some(s => s.tables().some(t => t.name().value() === 'tbl1'))).to.be.true;
        });

        // --- Extended usage patterns ---

        it('should showCreate() for given selector (1)', async () => {
            const a = await driver.showCreate({ lq_test_public: ['*'] }, true);
            expect(a).to.have.lengthOf(1);
            expect(a[0].name().value()).to.eq('lq_test_public');

            const b = await driver.showCreate([{ schema: 'lq_test_public', tables: ['*'] }], true);
            const c = await driver.showCreate({ lq_test_public: ['*'] }, true);

            expect(b).to.have.lengthOf(1);
            expect(c).to.have.lengthOf(1);

            expect(b[0].tables()).to.have.lengthOf(2);
            expect(c[0].tables()).to.have.lengthOf(2);

            expect(b[0].tables().map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl2']);
            expect(c[0].tables().map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl2']);
        });

        it('should showCreate() for given selector (2)', async () => {
            const b = await driver.showCreate({ lq_test_public: ['tbl1'] }, true);
            const c = await driver.showCreate({ lq_test_public: ['!tbl1'] }, true);

            expect(b).to.have.lengthOf(1);
            expect(c).to.have.lengthOf(1);

            expect(b[0].tables()).to.have.lengthOf(1);
            expect(c[0].tables()).to.have.lengthOf(1);

            expect(b[0].tables()[0].name().value()).to.eq('tbl1');
            expect(c[0].tables()[0].name().value()).to.eq('tbl2');
        });

        it('should showCreate() for given selector (3)', async () => {
            const b = await driver.showCreate({ ['*']: ['tbl1'] }, true);
            const c = await driver.showCreate({ ['*']: ['!tbl1'] }, true);

            expect(b).to.have.lengthOf(3);
            expect(c).to.have.lengthOf(3);

            expect(b[0].tables()).to.have.lengthOf(1);
            expect(b[0].tables()[0].name().value()).to.eq('tbl1');

            expect(c[1].tables()).to.have.lengthOf(1);
            expect(b[1].tables()[0].name().value()).to.eq('tbl1');
            expect(c[1].tables()[0].name().value()).to.eq('tbl2');
        });

        it('should showCreate() for given selector (4)', async () => {
            const b = await driver.showCreate({ ['*']: ['tbl1'] });
            const c = await driver.showCreate({ ['*']: ['*'] });

            expect(b.map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl1', 'tbl1']);
            expect(c.map((t) => t.name().value())).to.deep.eq(['tbl1', 'tbl2', 'tbl1', 'tbl2', 'tbl1', 'tbl2']);
        });
    });

    describe('PROVIDE', () => {
        it('should provide() the specified schema', async () => {
            const resultCode = await driver.schemaInference.provide([{ schema: 'lq_test_%', tables: ['tbl1'] }]);
            const catalog = [...driver.schemaInference.catalog];

            expect(resultCode).to.eq(1);
            expect(catalog).to.have.lengthOf(3);

            const lq_test_show = catalog.find((s) => s.identifiesAs('lq_test_show'));
            const lq_test_public = catalog.find((s) => s.identifiesAs('lq_test_public'));
            const lq_test_private = catalog.find((s) => s.identifiesAs('lq_test_private'));

            expect(lq_test_show.tables()).to.have.lengthOf(1);
            expect(lq_test_public.tables()).to.have.lengthOf(1);
            expect(lq_test_private.tables()).to.have.lengthOf(1);

            // ----------------- heuristic caching
            const resultCode2 = await driver.schemaInference.provide([{ schema: 'lq_test_%', tables: ['tbl1'] }]);
            expect(resultCode2).to.eq(0);
            const resultCode3 = await driver.schemaInference.provide([{ schema: 'lq_test_private', tables: ['tbl1'] }]);
            expect(resultCode3).to.eq(0);
            const resultCode4 = await driver.schemaInference.provide([{ schema: 'lq_test_foo', tables: ['tbl1'] }]);
            expect(resultCode4).to.eq(0);
            const resultCode5 = await driver.schemaInference.provide([{ schema: 'lq_test_%', tables: ['tbl1', 'tbl_1'] }]);
            expect(resultCode5).to.eq(2);
        });

        it('should incrementally provide() the specified schema', async () => {
            const resultCode = await driver.schemaInference.provide([{ schema: 'lq_test_%', tables: ['tbl2'] }]);
            const catalog = [...driver.schemaInference.catalog];

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

describe('LocalDriver - DML', () => {
    let driver;

    // helper to read table storage rows (values)
    async function tableRows(tableName, schema = 'lq_test_dml') {
        const store = await driver.storageEngine.tableStorage(tableName, schema);
        return [...store.values()];
    }

    // helper to clear tables by name
    async function clearTable(tableName, schema = 'lq_test_dml') {
        const store = await driver.storageEngine.tableStorage(tableName, schema);
        store.clear();
    }

    before(async () => {
        driver = new LocalDriver();
        await driver.connect();

        // prepare schema + tables used across the tests
        await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_dml');

        // people: PK (manual), used for many tests
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_dml.people (id INT PRIMARY KEY, name TEXT, age INT)');

        // identity / defaults tests
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_dml.auto_people (id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name TEXT)');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_dml.defaults (id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, cnt INT DEFAULT 7)');

        // for update-from / join-based tests
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_dml.updates (person_id INT PRIMARY KEY, new_name TEXT)');

        // for multi-table update/delete tests
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_dml.multi_a (id INT PRIMARY KEY, val INT)');
        await driver.query('CREATE TABLE IF NOT EXISTS lq_test_dml.multi_b (id INT PRIMARY KEY, val INT)');

        // ensure tables are empty before tests start
        for (const t of ['people', 'auto_people', 'defaults', 'updates', 'multi_a', 'multi_b']) {
            try { await clearTable(t); } catch (e) { /* ignore */ }
        }
    });

    after(async () => {
        await driver.disconnect();
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
            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (1, 'Alice', 30)");
            const rows = await tableRows('people');
            expect(rows).to.have.lengthOf(1);
            expect(rows[0]).to.deep.include({ id: 1, name: 'Alice', age: 30 });
        });

        it('INSERT ... VALUES (multiple rows)', async () => {
            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (2, 'Bob', 25), (3, 'Carol', 28)");
            const rows = await tableRows('people');
            expect(rows.map(r => r.id).sort()).to.deep.eq([2, 3]);
        });

        it('INSERT ... DEFAULT VALUES (Postgres) uses defaults', async () => {
            // defaults table has id identity and cnt default 7
            const res = await driver.query("INSERT INTO lq_test_dml.defaults DEFAULT VALUES RETURNING *");
            // driver.query should return returning rows; fallback to storage inspection if not
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
            await driver.query("INSERT INTO lq_test_dml.people SET id = 10, name = 'Zed', age = 50", { dialect: 'mysql' });
            const rows = await tableRows('people');
            expect(rows.some(r => r.id === 10 && r.name === 'Zed')).to.be.true;
        });

        it('INSERT ... RETURNING (Postgres)', async () => {
            await clearTable('people');
            const r = await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (20, 'X', 99) RETURNING id, name");
            expect(r.rows).to.have.lengthOf(1);
            expect(r.rows[0]).to.deep.eq({ id: 20, name: 'X' });
        });

        it('INSERT ... ON CONFLICT DO NOTHING (Postgres)', async () => {
            await clearTable('people');
            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (30, 'Sam', 40)");
            const r = await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (30, 'SamX', 41) ON CONFLICT (id) DO NOTHING RETURNING *");
            // returning should be empty
            expect(r.rows).to.have.lengthOf(0);
            // underlying row unchanged
            const rows = await tableRows('people');
            expect(rows.find(row => row.id === 30).name).to.eq('Sam');
        });

        it('INSERT ... ON CONFLICT DO UPDATE (Postgres)', async () => {
            await clearTable('people');
            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (31, 'Ann', 23)");
            const r = await driver.query(`
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
            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (200, 'M', 60)", { dialect: 'mysql' });
            // Duplicate insert with ON DUPLICATE KEY UPDATE
            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (200, 'M2', 61) ON DUPLICATE KEY UPDATE name = VALUES(name), age = VALUES(age)", { dialect: 'mysql' });
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
            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (401, 'U1', 20), (402, 'U2', 25)");
            await driver.query("INSERT INTO lq_test_dml.multi_a (id, val) VALUES (1, 10), (2, 20)");
            await driver.query("INSERT INTO lq_test_dml.multi_b (id, val) VALUES (1, 100), (2, 200)");
        });

        it('UPDATE ... SET ... WHERE (basic)', async () => {
            await driver.query("UPDATE lq_test_dml.people SET age = 21 WHERE id = 401");
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 401).age).to.eq(21);
        });

        it('UPDATE (Postgres) ... FROM join', async () => {
            // prepare updates table
            await driver.query("INSERT INTO lq_test_dml.updates (person_id, new_name) VALUES (401, 'UpdatedU1')");
            const r = await driver.query(`
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
            await driver.query("UPDATE lq_test_dml.people SET (name, age) = ('Tupleed', 99) WHERE id = 402");
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 402)).to.deep.include({ name: 'Tupleed', age: 99 });
        });

        it('MySQL multi-table UPDATE (a, b syntax)', async () => {
            // update multi_a.val from multi_b.val using mysql multi-table update
            await driver.query("UPDATE lq_test_dml.multi_a a, lq_test_dml.multi_b b SET a.val = b.val WHERE a.id = b.id", { dialect: 'mysql' });
            const aRows = await tableRows('multi_a');
            expect(aRows.find(r => r.id === 1).val).to.eq(100);
            expect(aRows.find(r => r.id === 2).val).to.eq(200);
        });

        it('UPDATE returns empty when no rows match', async () => {
            const r = await driver.query("UPDATE lq_test_dml.people SET age = 999 WHERE id = 9999 RETURNING *");
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

            await driver.query("INSERT INTO lq_test_dml.people (id, name, age) VALUES (601, 'D1', 40), (602, 'D2', 50)");
            await driver.query("INSERT INTO lq_test_dml.multi_a (id, val) VALUES (10, 1), (11, 2)");
            await driver.query("INSERT INTO lq_test_dml.multi_b (id, val) VALUES (10, 1), (11, 2)");
        });

        it('DELETE ... WHERE (basic)', async () => {
            await driver.query("DELETE FROM lq_test_dml.people WHERE id = 601");
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 601)).to.be.undefined;
            expect(rows.some(r => r.id === 602)).to.be.true;
        });

        it('DELETE ... RETURNING (Postgres)', async () => {
            const r = await driver.query("DELETE FROM lq_test_dml.people WHERE id = 602 RETURNING *");
            expect(r.rows[0]).to.deep.include({ id: 602, name: 'D2' });
            const rows = await tableRows('people');
            expect(rows.find(r => r.id === 602)).to.be.undefined;
        });

        it('MySQL: multi-table DELETE a,b FROM ... JOIN ...', async () => {
            // delete both multi_a and multi_b rows that match id=10
            await driver.query("DELETE a, b FROM lq_test_dml.multi_a a JOIN lq_test_dml.multi_b b ON a.id = b.id WHERE a.id = 10", { dialect: 'mysql' });
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
            await driver.query("INSERT INTO lq_test_dml.multi_a (id, val) VALUES (20, 1), (21, 2)");
            await driver.query("INSERT INTO lq_test_dml.multi_b (id, val) VALUES (20, 1)");
            await driver.query("DELETE FROM lq_test_dml.multi_a a USING lq_test_dml.multi_b b WHERE a.id = b.id");
            const aRows = await tableRows('multi_a');
            expect(aRows.find(r => r.id === 20)).to.be.undefined;
            expect(aRows.find(r => r.id === 21)).to.exist;
        });

        it('DELETE non-existent rows does not fail', async () => {
            const r = await driver.query("DELETE FROM lq_test_dml.people WHERE id = 9999 RETURNING *");
            expect(r.rows).to.have.lengthOf(0);
        });
    });
});
