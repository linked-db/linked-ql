import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { AbstractDBAdapter } from '../src/db/abstracts/AbstractDBAdapter.js';
import { StorageEngine } from '../src/db/local/StorageEngine.js';
import { LocalDBClient } from '../src/db/local/LocalDBClient.js';
import { PGClient } from '../src/db/classic/PGClient.js';
const out = 3;

describe('Util', () => {

    it('should match plain db selector', async () => {
        const instance = new AbstractDBAdapter;
        const a = instance._matchSelector('lq_test_public', ['lq_test_public', 'lq_test_private']);
        const b = instance._matchSelector('lq_test_public', ['lq_test_public2', 'lq_test_private']);
        expect(a).to.be.true;
        expect(b).to.be.false;
    });

    it('should match negated plain db selector', async () => {
        const instance = new AbstractDBAdapter();
        const a = instance._matchSelector('lq_test_public', ['!lq_test_public', 'lq_test_private']);
        const b = instance._matchSelector('lq_test_public', ['!lq_test_public2', 'lq_test_public']);
        const c = instance._matchSelector('lq_test_public', ['!lq_test_public2', '!lq_test_private']);
        expect(a).to.be.false;
        expect(b).to.be.true;
        expect(c).to.be.true;
    });

    it('should match wildcard db selector', async () => {
        const instance = new AbstractDBAdapter();
        const a = instance._matchSelector('lq_test_public', ['%ublic', 'lq_test_private']);
        const b = instance._matchSelector('lq_test_public', ['publi%']);
        const c = instance._matchSelector('lq_test_public', ['publo%']);
        expect(a).to.be.true;
        expect(b).to.be.true;
        expect(c).to.be.false;
    });

    it('should match negated wildcard db selector', async () => {
        const instance = new AbstractDBAdapter();
        const a = instance._matchSelector('lq_test_public', ['!%ublic', 'lq_test_private']);
        const b = instance._matchSelector('lq_test_public', ['!publi%']);
        const c = instance._matchSelector('lq_test_public', ['!publo%']);
        expect(a).to.be.false;
        expect(b).to.be.false;
        expect(c).to.be.true;
    });
});

describe('StorageEngine', () => {

    let storageEngine;

    it('should create basic table schema', async () => {
        storageEngine = new StorageEngine;
        const createTableSuccess = storageEngine.createTable('tbl1');
        expect(createTableSuccess).to.be.true;
    });

    it('should reject creating an existing table schema', async () => {
        expect(() => storageEngine.createTable('tbl1')).to.throw();
    });

    it('should retrieve just-created table schema', async () => {
        const tableNames = storageEngine.tableNames();
        expect(tableNames).to.include('tbl1');

        const tblSchema = storageEngine.tableSchema('tbl1');
        expect(tblSchema).to.be.an('object');

        const pkCols = storageEngine.tablePK('tbl1');
        expect(pkCols).to.be.an('array').with.length(1);
    });

    it('should pass basic INSERT', async () => {
        const pk = storageEngine.insert('tbl1', { id: 34, name: 'John' });
        expect(pk).to.eq('[34]');
    });

    it('should reject duplicate-key INSERT', async () => {
        expect(() => storageEngine.insert('tbl1', { id: 34, name: 'John' })).to.throw();
    });

    it('should pass basic UPDATE', async () => {
        const pk = storageEngine.update('tbl1', { id: 34, name: 'John2' });
        expect(pk).to.eq('[34]');
    });

    it('should pass basic READ', async () => {
        const record = storageEngine.get('tbl1', { id: 34 });
        expect(record).to.deep.eq({ id: 34, name: 'John2' });
    });

    it('should pass basic scan', async () => {
        const records = storageEngine.scan('tbl1');
        const _records = [];
        for await (const record of records) {
            _records.push(record);
        }
        expect(_records).to.have.length(1);
        expect(_records[0]).to.deep.eq({ id: 34, name: 'John2' });
    });

    it('should pass basic DELETE', async () => {
        const pk = storageEngine.delete('tbl1', { id: 34 });
        expect(pk).to.eq('[34]');

        const record = storageEngine.get('tbl1', { id: 34 });
        expect(record).to.be.undefined;
    });

    it('should do auto-increment', async () => {
        const pk1 = storageEngine.insert('tbl1', { name: 'John' });
        expect(pk1).to.eq('[1]');

        const pk2 = storageEngine.insert('tbl1', { name: 'John' });
        expect(pk2).to.eq('[2]');
    });
});

describe('LocalDBClient', () => {

    let client, database1, database2;
    before(() => {
        client = new LocalDBClient;
        database1 = client.createDatabase('lq_test_public');
        database2 = client.createDatabase('lq_test_private');
        database1.createTable('tbl1');
        database2.createTable('tbl1');
        database2.createTable('tbl2');
    });


    it('should pass basic database-create', async () => {
        expect(database1).to.instanceOf(StorageEngine);
        expect(database2).to.instanceOf(StorageEngine);
    });

    it('should reject duplicated database-create', async () => {
        expect(() => client.createDatabase('lq_test_public')).to.throw();
    });

    it('should showCreate() for given selector (1)', async () => {
        const a = await client.showCreate([{ schemaName: 'lq_test_public' }], true);

        expect(a).to.have.lengthOf(1);
        expect(a[0].name().value()).to.eq('lq_test_public');

        const b = await client.showCreate([{ schemaName: 'lq_test_public', tables: ['*'] }], true);
        const c = await client.showCreate([{ schemaName: 'lq_test_public' }], true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(1);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
        expect(c[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (2)', async () => {
        const b = await client.showCreate([{ schemaName: 'lq_test_public', tables: ['tbl1'] }], true);
        const c = await client.showCreate([{ schemaName: 'lq_test_public', tables: ['!tbl1'] }], true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(0);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (3)', async () => {
        const b = await client.showCreate([{ schemaName: '*', tables: ['tbl1'] }], true);
        const c = await client.showCreate([{ schemaName: '*', tables: ['!tbl1'] }], true);

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(2);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(b[0].tables()[0].name().value()).to.eq('tbl1');

        expect(c[1]/* lq_test_private */.tables()).to.have.lengthOf(1);
        expect(b[1]/* lq_test_private */.tables()[0].name().value()).to.eq('tbl1');
        expect(c[1]/* lq_test_private */.tables()[0].name().value()).to.eq('tbl2');
    });

    it('should showCreate() for given selector (3)', async () => {
        const b = await client.showCreate([{ schemaName: '*', tables: ['tbl1'] }]);
        const c = await client.showCreate([{ schemaName: '*', tables: ['*'] }]);

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(3);

        expect(b[0].name().value()).to.eq('tbl1');
        expect(b[1].name().value()).to.eq('tbl1');

        expect(c[0].name().value()).to.eq('tbl1');
        expect(c[1].name().value()).to.eq('tbl1');
        expect(c[2].name().value()).to.eq('tbl2');
    });
});

describe('PGClient', () => {

    let client, database1, database2;
    before(async () => {
        client = new PGClient({
            database: 'postgres',
        });
        await client.connect();
        await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_public');
        await client.query('CREATE SCHEMA IF NOT EXISTS lq_test_private');
        await client.query(`CREATE TABLE IF NOT EXISTS lq_test_public.tbl1 (
            id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS lq_test_private.tbl1 (
            id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS lq_test_private.tbl2 (
            id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY
        )`);
    });

    after(async () => {
        await client.query('DROP SCHEMA IF EXISTS lq_test_public CASCADE');
        await client.query('DROP SCHEMA IF EXISTS lq_test_private CASCADE');
    });

    it('should showCreate() for given selector (1)', async () => {
        const a = await client.showCreate([{ schemaName: 'lq_test_public' }], true);

        expect(a).to.have.lengthOf(1);
        expect(a[0].name().value()).to.eq('lq_test_public');

        const b = await client.showCreate([{ schemaName: 'lq_test_public', tables: ['*'] }], true);
        const c = await client.showCreate([{ schemaName: 'lq_test_public' }], true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(1);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
        expect(c[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (2)', async () => {
        const b = await client.showCreate([{ schemaName: 'lq_test_public', tables: ['tbl1'] }], true);
        const c = await client.showCreate([{ schemaName: 'lq_test_public', tables: ['!tbl1'] }], true);

        expect(b).to.have.lengthOf(1);
        expect(c).to.have.lengthOf(1);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(c[0].tables()).to.have.lengthOf(0);

        expect(b[0].tables()[0].name().value()).to.eq('tbl1');
    });

    it('should showCreate() for given selector (3)', async () => {
        const b = await client.showCreate([{ schemaName: 'lq_test_%', tables: ['tbl1'] }], true);
        const c = await client.showCreate([{ schemaName: 'lq_test_%', tables: ['!tbl1'] }], true);

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(2);

        expect(b[0].tables()).to.have.lengthOf(1);
        expect(b[0].tables()[0].name().value()).to.eq('tbl1');

        const lq_test_private = c.find((s) => s.identifiesAs('lq_test_private'));
        expect(lq_test_private.tables()).to.have.lengthOf(1);
        expect(lq_test_private.tables()[0].name().value()).to.eq('tbl2');
    });

    it('should showCreate() for given selector (3)', async () => {
        const b = await client.showCreate([{ schemaName: 'lq_test_%', tables: ['tbl1'] }]);
        const c = await client.showCreate([{ schemaName: 'lq_test_%', tables: ['*'] }]);

        expect(b).to.have.lengthOf(2);
        expect(c).to.have.lengthOf(3);

        expect(b[0].name().value()).to.eq('tbl1');
        expect(b[1].name().value()).to.eq('tbl1');

        expect(c.map((s) => s.name().value())).to.have.members(['tbl1', 'tbl1', 'tbl2']);
    });
});