import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { matchSelector, normalizeSelectorArg } from '../src/db/abstracts/util.js';
import { StorageEngine } from '../src/db/local/StorageEngine.js';
import { LocalDriver } from '../src/db/local/LocalDriver.js';
import { PGDriver } from '../src/db/driver/PGDriver.js';
import { DBContext } from '../src/lang/DBContext.js';

describe('Util', () => {

    it('should normalize selector forms', () => {
        expect(() => normalizeSelectorArg()).to.throw(/Given selector .* invalid/);
        expect(() => normalizeSelectorArg(null)).to.throw(/Given selector .* invalid/);
        expect(() => normalizeSelectorArg({})).to.throw(/Given selector .* invalid/);

        expect(() => normalizeSelectorArg([{ schema: 'b' }, { a: 'b' }])).to.throw(/Given selector .* invalid at index 1/);

        const a = normalizeSelectorArg('*');
        expect(a).to.deep.eq({ ['*']: [ '*' ] });
        const b = normalizeSelectorArg({ a: 'b' });
        expect(b).to.deep.eq({ a: ['b'] });
        const c = normalizeSelectorArg([{ schema: 'b' }]);
        expect(c).to.deep.eq({ b: [ '*' ] });
    });

    it('should match plain db selector', () => {
        const a = matchSelector('lq_test_public', ['lq_test_public', 'lq_test_private']);
        const b = matchSelector('lq_test_public', ['lq_test_public2', 'lq_test_private']);
        expect(a).to.be.true;
        expect(b).to.be.false;
    });

    it('should match negated plain db selector', () => {
        const a = matchSelector('lq_test_public', ['!lq_test_public', 'lq_test_private']);
        const b = matchSelector('lq_test_public', ['!lq_test_public2', 'lq_test_public']);
        const c = matchSelector('lq_test_public', ['!lq_test_public2', '!lq_test_private']);
        expect(a).to.be.false;
        expect(b).to.be.true;
        expect(c).to.be.true;
    });

    it('should match wildcard db selector', () => {
        const a = matchSelector('lq_test_public', ['%ublic', 'lq_test_private']);
        const b = matchSelector('lq_test_public', ['publi%']);
        const c = matchSelector('lq_test_public', ['publo%']);
        expect(a).to.be.true;
        expect(b).to.be.true;
        expect(c).to.be.false;
    });

    it('should match negated wildcard db selector', () => {
        const a = matchSelector('lq_test_public', ['!%ublic', 'lq_test_private']);
        const b = matchSelector('lq_test_public', ['!publi%']);
        const c = matchSelector('lq_test_public', ['!publo%']);
        expect(a).to.be.false;
        expect(b).to.be.false;
        expect(c).to.be.true;
    });
});

describe('StorageEngine - Basic CRUD', () => {

    let storageEngine;

    it('should create basic table schema', async () => {
        storageEngine = new StorageEngine;
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

        const pkCols = await storageEngine.tablePK('tbl1');
        expect(pkCols).to.be.an('array').with.length(1);
    });

    it('should do basic INSERT', async () => {
        const pk = await storageEngine.insert('tbl1', { id: 34, name: 'John' });
        expect(pk).to.eq('[34]');
    });

    it('should reject duplicate-key INSERT', async () => {
        expect(storageEngine.insert('tbl1', { id: 34, name: 'John' })).to.be.rejected;
    });

    it('should do basic UPDATE', async () => {
        const pk = await storageEngine.update('tbl1', { id: 34, name: 'John2' });
        expect(pk).to.eq('[34]');
    });

    it('should do basic READ', async () => {
        const record = await storageEngine.get('tbl1', { id: 34 });
        expect(record).to.deep.eq({ id: 34, name: 'John2' });
    });

    it('should do basic scan', async () => {
        const records = await storageEngine.scan('tbl1');
        const _records = [];
        for await (const record of records) {
            _records.push(record);
        }
        expect(_records).to.have.length(1);
        expect(_records[0]).to.deep.eq({ id: 34, name: 'John2' });
    });

    it('should do basic DELETE', async () => {
        const pk = await storageEngine.delete('tbl1', { id: 34 });
        expect(pk).to.eq('[34]');

        const record = await storageEngine.get('tbl1', { id: 34 });
        expect(record).to.be.undefined;
    });

    it('should do auto-increment', async () => {
        const pk1 = await storageEngine.insert('tbl1', { name: 'John' });
        expect(pk1).to.eq('[1]');

        const pk2 = await storageEngine.insert('tbl1', { name: 'John' });
        expect(pk2).to.eq('[2]');
    });
});

describe('LocalDriver - showCreate()', () => {

    let driver, storage1, storage2;
    before(async () => {
        driver = new LocalDriver;
        storage1 = await driver.createSchema('lq_test_public');
        storage2 = await driver.createSchema('lq_test_private');
        await storage1.createTable('tbl1');
        await storage2.createTable('tbl1');
        await storage2.createTable('tbl2');
    });

    it('should do basic schema-create', async () => {
        expect(storage1).to.instanceOf(StorageEngine);
        expect(storage2).to.instanceOf(StorageEngine);
    });

    it('should reject duplicated schema-create', async () => {
        expect(driver.createSchema('lq_test_public')).to.be.rejected;
    });

    it('should showCreate() for given selector (1)', async () => {
        const a = await driver.showCreate({ lq_test_public: ['*'] }, true);

        expect(a).to.have.lengthOf(1);
        expect(a[0].name().value()).to.eq('lq_test_public');

        const b = await driver.showCreate([{ schema: 'lq_test_public', tables: ['*'] }], true);
        const c = await driver.showCreate({ lq_test_public: ['*'] }, true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(1);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
        expect(c[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (2)', async () => {
        const b = await driver.showCreate({ lq_test_public: ['tbl1'] }, true);
        const c = await driver.showCreate({ lq_test_public: ['!tbl1'] }, true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(0);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (3)', async () => {
        const b = await driver.showCreate({ ['*']: ['tbl1'] }, true);
        const c = await driver.showCreate({ ['*']: ['!tbl1'] }, true);

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(2);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(b[0].tables()[0].name().value()).to.eq('tbl1');

        expect(c[1]/* lq_test_private */.tables()).to.have.lengthOf(1);
        expect(b[1]/* lq_test_private */.tables()[0].name().value()).to.eq('tbl1');
        expect(c[1]/* lq_test_private */.tables()[0].name().value()).to.eq('tbl2');
    });

    it('should showCreate() for given selector (4)', async () => {
        const b = await driver.showCreate({ ['*']: ['tbl1'] });
        const c = await driver.showCreate({ ['*']: ['*'] });

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(3);

        expect(b[0].name().value()).to.eq('tbl1');
        expect(b[1].name().value()).to.eq('tbl1');

        expect(c[0].name().value()).to.eq('tbl1');
        expect(c[1].name().value()).to.eq('tbl1');
        expect(c[2].name().value()).to.eq('tbl2');
    });

    describe('- DBContext', () => {

        let dbContext;
        before(() => {
            dbContext = new DBContext({ dbAdapter: driver });
        });

        it('should provide() the specified schema', async () => {
            const resultCode = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl1'] }]);
            const catalog = [...dbContext.catalog];

            expect(resultCode).to.eq(1);
            expect(catalog).to.have.lengthOf(2);

            const lq_test_public = catalog.find((s) => s.identifiesAs('lq_test_public'));
            const lq_test_private = catalog.find((s) => s.identifiesAs('lq_test_private'));

            expect(lq_test_public.tables()).to.have.lengthOf(1);
            expect(lq_test_private.tables()).to.have.lengthOf(1);

            // ----------------- Test heuristic-based caching

            const resultCode2 = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl1'] }]);
            expect(resultCode2).to.eq(0);
            const resultCode3 = await dbContext.provide([{ schema: 'lq_test_private', tables: ['tbl1'] }]);
            expect(resultCode3).to.eq(0);
            const resultCode4 = await dbContext.provide([{ schema: 'lq_test_foo', tables: ['tbl1'] }]);
            expect(resultCode4).to.eq(0);
            // Intersection found? "2"
            const resultCode5 = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl1', 'tbl_1'] }]);
            expect(resultCode5).to.eq(2);
        });

        it('should incrementally provide() the specified schema', async () => {
            const resultCode = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl2'] }]);
            const catalog = [...dbContext.catalog];

            expect(resultCode).to.eq(1);
            expect(catalog).to.have.lengthOf(2);

            const lq_test_public = catalog.find((s) => s.identifiesAs('lq_test_public'));
            const lq_test_private = catalog.find((s) => s.identifiesAs('lq_test_private'));

            expect(lq_test_public.tables()).to.have.lengthOf(1);
            expect(lq_test_private.tables()).to.have.lengthOf(2);
        });
    });
});

describe('PGDriver - showCreate()', () => {

    let driver;
    before(async () => {
        driver = new PGDriver({
            database: 'postgres',
        });
        await driver.connect();
        await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_public');
        await driver.query('CREATE SCHEMA IF NOT EXISTS lq_test_private');
        await driver.query(`CREATE TABLE IF NOT EXISTS lq_test_public.tbl1 (
            id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY
        )`);
        await driver.query(`CREATE TABLE IF NOT EXISTS lq_test_private.tbl1 (
            id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY
        )`);
        await driver.query(`CREATE TABLE IF NOT EXISTS lq_test_private.tbl2 (
            id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY
        )`);
    });

    after(async () => {
        await driver.query('DROP SCHEMA IF EXISTS lq_test_public CASCADE');
        await driver.query('DROP SCHEMA IF EXISTS lq_test_private CASCADE');
    });

    it('should showCreate() for given selector (1)', async () => {
        const a = await driver.showCreate({ lq_test_public: ['*'] }, true);

        expect(a).to.have.lengthOf(1);
        expect(a[0].name().value()).to.eq('lq_test_public');

        const b = await driver.showCreate([{ schema: 'lq_test_public', tables: ['*'] }], true);
        const c = await driver.showCreate({ lq_test_public: ['*'] }, true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(1);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
        expect(c[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (2)', async () => {
        const b = await driver.showCreate({ lq_test_public: ['tbl1'] }, true);
        const c = await driver.showCreate({ lq_test_public: ['!tbl1'] }, true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(0);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (3)', async () => {
        const b = await driver.showCreate({ ['lq_test_%']: ['tbl1'] }, true);
        const c = await driver.showCreate({ ['lq_test_%']: ['!tbl1'] }, true);

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(2);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(b[0].tables()[0].name().value()).to.eq('tbl1');

        const lq_test_private = c.find((s) => s.identifiesAs('lq_test_private'));
        expect(lq_test_private.tables()).to.have.lengthOf(1);
        expect(lq_test_private.tables()[0].name().value()).to.eq('tbl2');
    });

    it('should showCreate() for given selector (4)', async () => {
        const b = await driver.showCreate({ ['lq_test_%']: ['tbl1'] });
        const c = await driver.showCreate({ ['lq_test_%']: ['*'] });

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(3);

        expect(b[0].name().value()).to.eq('tbl1');
        expect(b[1].name().value()).to.eq('tbl1');

        expect(c.map((s) => s.name().value())).to.have.members(['tbl1', 'tbl1', 'tbl2']);
    });

    describe('- DBContext', () => {

        let dbContext;
        before(() => {
            dbContext = new DBContext({ dbAdapter: driver });
        });

        it('should provide() the specified schema', async () => {
            const resultCode = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl1'] }]);
            const catalog = [...dbContext.catalog];

            expect(resultCode).to.eq(1);
            expect(catalog).to.have.lengthOf(2);

            const lq_test_public = catalog.find((s) => s.identifiesAs('lq_test_public'));
            const lq_test_private = catalog.find((s) => s.identifiesAs('lq_test_private'));

            expect(lq_test_public.tables()).to.have.lengthOf(1);
            expect(lq_test_private.tables()).to.have.lengthOf(1);

            // ----------------- Test heuristic-based caching

            const resultCode2 = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl1'] }]);
            expect(resultCode2).to.eq(0);
            const resultCode3 = await dbContext.provide([{ schema: 'lq_test_private', tables: ['tbl1'] }]);
            expect(resultCode3).to.eq(0);
            const resultCode4 = await dbContext.provide([{ schema: 'lq_test_foo', tables: ['tbl1'] }]);
            expect(resultCode4).to.eq(0);
            // Intersection found? "2"
            const resultCode5 = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl1', 'tbl_1'] }]);
            expect(resultCode5).to.eq(2);
        });

        it('should incrementally provide() the specified schema', async () => {
            const resultCode = await dbContext.provide([{ schema: 'lq_test_%', tables: ['tbl2'] }]);
            const catalog = [...dbContext.catalog];

            expect(resultCode).to.eq(1);
            expect(catalog).to.have.lengthOf(2);

            const lq_test_public = catalog.find((s) => s.identifiesAs('lq_test_public'));
            const lq_test_private = catalog.find((s) => s.identifiesAs('lq_test_private'));

            expect(lq_test_public.tables()).to.have.lengthOf(1);
            expect(lq_test_private.tables()).to.have.lengthOf(2);
        });
    });
});