import { expect } from 'chai';

import '../src/lang/index.js';
import { LiteQL } from '../src/db/l/LiteQL.js';
import { PGDriver } from '../src/db/postgres/PGDriver.js';
import { SchemaInference } from '../src/lang/SchemaInference.js';
import { QueryWindow } from '../src/db/realtime/QueryWindow.js';
import { registry } from '../src/lang/registry.js';

// TODO: repeat some of these tests with double keys

export function collectEvents() {
    const events = [];
    return { events, listener: (e) => events.push(...[].concat(e)) };
}

describe('Local - Subscriptions', () => {

    describe('StorageEngine - Mutation Events', () => {

        let driver, storage, relation, eventsCollector;
        before(async () => {
            driver = new LiteQL;
            storage = await driver.createSchema('lq_test_public');
            await storage.createTable('tbl1');
            relation = { name: 'tbl1', keyColumns: ['id'] };
            eventsCollector = collectEvents();
            storage.on('mutation', eventsCollector.listener);
        });

        it('should emit mutation event ("insert") for an insert operation', async () => {
            eventsCollector.events.length = 0;

            const record = { id: 10, fname: 'John', email: 'x@x.com' };
            await storage.insert('tbl1', record);

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('insert');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, new: record });
        });

        it('should emit mutation event ("update") for an update operation', async () => {
            eventsCollector.events.length = 0;

            const key = { id: 10 };
            const record = { id: 10, fname: 'John Doe', email: 'x@x.com' };
            await storage.update('tbl1', record);

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('update');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, key, new: record });
        });

        it('should emit mutation event ("delete") for a delete operation', async () => {
            eventsCollector.events.length = 0;

            const key = { id: 10 };
            await storage.delete('tbl1', key);

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('delete');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, key });
        });
    });

    describe('LiteQL - Subscriptions', () => {

        let driver, storage, relation, eventsCollector;
        before(async () => {
            driver = new LiteQL;
            storage = await driver.createSchema('lq_test_public');

            await storage.createTable('tbl1');

            relation = { schema: 'lq_test_public', name: 'tbl1', keyColumns: ['id'] };
            eventsCollector = collectEvents();
            driver.subscribe(eventsCollector.listener);
        });

        it('should emit mutation event ("insert") for an insert operation', async () => {
            eventsCollector.events.length = 0;

            const record = { id: 10, fname: 'John', email: 'x@x.com' };
            await storage.insert('tbl1', record);

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('insert');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, new: record });
        });

        it('should emit mutation event ("update") for an update operation', async () => {
            eventsCollector.events.length = 0;

            const key = { id: 10 };
            const record = { id: 10, fname: 'John Doe', email: 'x@x.com' };
            await storage.update('tbl1', record);

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('update');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, key, new: record });
        });

        it('should emit mutation event ("delete") for a delete operation', async () => {
            eventsCollector.events.length = 0;

            const key = { id: 10 };
            await storage.delete('tbl1', key);

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('delete');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, key });
        });
    });
});

describe('Classic - Subscriptions', () => {

    describe('PGDriver - Subscriptions (1)', () => {

        let driver, relation, eventsCollector;
        before(async () => {
            driver = new PGDriver({ realtime: true });
            await driver.connect();

            await driver.dropSchema('lq_test_public');
            await driver.createSchema('lq_test_public');
            await driver.query(`CREATE TABLE IF NOT EXISTS lq_test_public.tbl1 (
                id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
                fname TEXT,
                email TEXT
            )`);

            relation = { schema: 'lq_test_public', name: 'tbl1', keyColumns: ['id'] };
            eventsCollector = collectEvents();
            driver.subscribe(eventsCollector.listener);
        });

        after(async () => {
            await driver.dropSchema('lq_test_public');
            await driver.disconnect();
        });

        it('should emit mutation event ("insert") for an insert operation', async () => {
            eventsCollector.events.length = 0;

            const record = { id: 10, fname: 'John', email: 'x@x.com' };
            await driver.query(`
                INSERT INTO lq_test_public.tbl1 (id, fname, email)
                VALUES (${record.id}, '${record.fname}', '${record.email}')
            `);

            await new Promise((r) => setTimeout(r, 50));

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('insert');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, new: record });
        });

        it('should emit mutation event ("update") for an update operation', async () => {
            eventsCollector.events.length = 0;

            const record = { id: 10, fname: 'John Doe', email: 'x@x.com' };
            const key = { id: 10 };
            await driver.query(`
                UPDATE lq_test_public.tbl1 SET fname = '${record.fname}' WHERE id = ${key.id}
            `);

            await new Promise((r) => setTimeout(r, 50));

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('update');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, key, new: record });
        });

        it('should emit mutation event ("delete") for a delete operation', async () => {
            eventsCollector.events.length = 0;

            const key = { id: 10 };
            await driver.query(`
                DELETE FROM lq_test_public.tbl1 WHERE id = ${key.id}
            `);

            await new Promise((r) => setTimeout(r, 50));

            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].type).to.equal('delete');
            expect(eventsCollector.events[0]).to.deep.includes({ relation, key });
        });
    });

    describe('PGDriver - Subscriptions (2)', () => {

        const schemaNames = ['lq_test_public', 'lq_test_private'];
        let driver, relations = [];
        before(async () => {
            driver = new PGDriver({ realtime: true });
            await driver.connect();

            for (const schemaName of schemaNames) {
                await driver.dropSchema(schemaName);
                await driver.createSchema(schemaName);
                await driver.query(`CREATE TABLE IF NOT EXISTS ${schemaName}.tbl1 (
                    id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
                    fname TEXT,
                    email TEXT
                )`);
                await driver.query(`CREATE TABLE IF NOT EXISTS ${schemaName}.tbl2 (
                    id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
                    fname TEXT,
                    email TEXT
                )`);
                relations.push({ schema: schemaName, name: 'tbl1', keyColumns: ['id'] });
            }
        });

        after(async () => {
            for (const schemaName of schemaNames) {
                await driver.dropSchema(schemaName);
            }
            await driver.disconnect();
        });

        it('should emit mutation event ("insert") for an insert operation', async () => {
            const eventsCollector1 = collectEvents();
            driver.subscribe(eventsCollector1.listener);

            const eventsCollector2 = collectEvents();
            driver.subscribe({ ['*']: ['tbl1'] }, eventsCollector2.listener);

            const eventsCollector3 = collectEvents();
            driver.subscribe({ [schemaNames[0]]: ['*'] }, eventsCollector3.listener);

            const eventsCollector4 = collectEvents();
            driver.subscribe({ [schemaNames[1]]: '*' }, eventsCollector4.listener);

            const eventsCollector5 = collectEvents();
            driver.subscribe({ [schemaNames[1]]: 'tbl1' }, eventsCollector5.listener);

            const records = [
                { id: 10, fname: 'John1', email: 'x1@x.com' },
                { id: 20, fname: 'John2', email: 'x2@x.com' },
                { id: 30, fname: 'John3', email: 'x3@x.com' },
                { id: 40, fname: 'John4', email: 'x4@x.com' },
            ];

            await driver.query(`
                INSERT INTO ${schemaNames[0]}.tbl1 (id, fname, email)
                VALUES
                    (${records[0].id}, '${records[0].fname}', '${records[0].email}'),
                    (${records[1].id}, '${records[1].fname}', '${records[1].email}');
                -- ||||||||||||||||||||
                INSERT INTO ${schemaNames[1]}.tbl1 (id, fname, email)
                VALUES
                    (${records[2].id}, '${records[2].fname}', '${records[2].email}'),
                    (${records[3].id}, '${records[3].fname}', '${records[3].email}')
            `);

            await new Promise((r) => setTimeout(r, 50));

            // --------- All
            for (const eventsCollector of [eventsCollector1, eventsCollector2]) {
                expect(eventsCollector.events).to.have.lengthOf(4);
                expect(eventsCollector.events.map((e) => e.type)).to.deep.eq(['insert', 'insert', 'insert', 'insert']);

                expect(eventsCollector.events[0]).to.deep.includes({ relation: relations[0], new: records[0] });
                expect(eventsCollector.events[1]).to.deep.includes({ relation: relations[0], new: records[1] });
                expect(eventsCollector.events[2]).to.deep.includes({ relation: relations[1], new: records[2] });
                expect(eventsCollector.events[3]).to.deep.includes({ relation: relations[1], new: records[3] });
            }

            // --------- Records - 0 & 1, 2 & 3
            const eventsCollectors = [eventsCollector3, eventsCollector4];
            for (let i = 0; i < 2; i++) {
                const eventsCollector = eventsCollectors[i];

                expect(eventsCollector.events).to.have.lengthOf(2);
                expect(eventsCollector.events.map((e) => e.type)).to.deep.eq(['insert', 'insert']);

                expect(eventsCollector.events[0]).to.deep.includes({ relation: relations[i], new: records[i === 0 ? 0 : 2] });
                expect(eventsCollector.events[1]).to.deep.includes({ relation: relations[i], new: records[i === 0 ? 1 : 3] });
            }

            // --------- Records - 2 & 3
            expect(eventsCollector5.events).to.have.lengthOf(2);
            expect(eventsCollector5.events.map((e) => e.type)).to.deep.eq(['insert', 'insert']);

            expect(eventsCollector5.events[0]).to.deep.includes({ relation: relations[1], new: records[2] });
            expect(eventsCollector5.events[1]).to.deep.includes({ relation: relations[1], new: records[3] });
        });

        it('should emit mutation event ("update") for an update operation', async () => {
            const eventsCollector1 = collectEvents();
            driver.subscribe(eventsCollector1.listener);

            const eventsCollector2 = collectEvents();
            driver.subscribe({ ['*']: ['tbl1'] }, eventsCollector2.listener);

            const eventsCollector3 = collectEvents();
            driver.subscribe({ [schemaNames[0]]: ['*'] }, eventsCollector3.listener);

            const eventsCollector4 = collectEvents();
            driver.subscribe({ [schemaNames[1]]: '*' }, eventsCollector4.listener);

            const eventsCollector5 = collectEvents();
            driver.subscribe({ [schemaNames[1]]: 'tbl1' }, eventsCollector5.listener);

            const records1 = [
                { id: 10, fname: 'John1', email: 'x1@x.com' },
                { id: 20, fname: 'John2', email: 'x2@x.com' },
            ];
            const records1b = records1.map((r) => ({ ...r, id: r.id + 1 }));
            const keys1 = records1.map((r) => ({ id: r.id }));

            const keys2 = [
                { id: 30 },
                { id: 40 },
            ];

            await driver.query(`
                UPDATE ${schemaNames[0]}.tbl1 SET id = id + 1 WHERE id IN (${keys1.map((r) => r.id).join(', ')});
                -- ||||||||||||||||||||
                DELETE FROM ${schemaNames[1]}.tbl1 WHERE id IN (${keys2.map((r) => r.id).join(', ')});
            `);

            await new Promise((r) => setTimeout(r, 50));

            // --------- All
            for (const eventsCollector of [eventsCollector1, eventsCollector2]) {
                expect(eventsCollector.events).to.have.lengthOf(4);
                expect(eventsCollector.events.map((e) => e.type)).to.deep.eq(['update', 'update', 'delete', 'delete']);

                expect(eventsCollector.events[0]).to.deep.includes({ type: 'update', relation: relations[0], key: keys1[0], new: records1b[0] });
                expect(eventsCollector.events[1]).to.deep.includes({ type: 'update', relation: relations[0], key: keys1[1], new: records1b[1] });
                expect(eventsCollector.events[2]).to.deep.includes({ type: 'delete', relation: relations[1], key: keys2[0] });
                expect(eventsCollector.events[3]).to.deep.includes({ type: 'delete', relation: relations[1], key: keys2[1] });
            }

            // --------- Only updates
            expect(eventsCollector3.events).to.have.lengthOf(2);
            expect(eventsCollector3.events.map((e) => e.type)).to.deep.eq(['update', 'update']);

            expect(eventsCollector3.events[0]).to.deep.includes({ relation: relations[0], key: keys1[0], new: records1b[0] });
            expect(eventsCollector3.events[1]).to.deep.includes({ relation: relations[0], key: keys1[1], new: records1b[1] });

            // --------- Only deletes
            const eventsCollectors = [eventsCollector4, eventsCollector5];
            for (let i = 0; i < 2; i++) {
                const eventsCollector = eventsCollectors[i];

                expect(eventsCollector.events).to.have.lengthOf(2);
                expect(eventsCollector.events.map((e) => e.type)).to.deep.eq(['delete', 'delete']);

                expect(eventsCollector.events[0]).to.deep.includes({ relation: relations[1], key: keys2[0] });
                expect(eventsCollector.events[1]).to.deep.includes({ relation: relations[1], key: keys2[1] });
            }
        });

        describe('- QueryWindow', () => {

            it('should do basic reactivity for a basic single-table query', async () => {

                const schemaInference = new SchemaInference({ driver });
                await schemaInference.provide([{ schema: 'lq_test_public', tables: ['tbl1'] }]);

                const sql = `SELECT fname || ':----:' || email FROM lq_test_public.tbl1 WHERE id > 0`;
                const _query = await registry.SelectStmt.parse(sql);
                const query = _query.deSugar(true, {}, null, schemaInference);

                const qw = new QueryWindow(driver, query);
                qw.on('error', (e) => console.error(e));

                const eventsCollector = collectEvents();
                qw.on('mutation', eventsCollector.listener);

                const initialResult = await qw.initialResult();

                expect(initialResult.rows).to.have.lengthOf(2);
                expect(initialResult.rows).to.deep.eq([
                    { '?column?': 'John1:----:x1@x.com' },
                    { '?column?': 'John2:----:x2@x.com' }
                ]);

                await driver.query(`
                    INSERT INTO lq_test_public.tbl1 (fname, email)
                    VALUES ('Hey', 'Hi');
                    UPDATE lq_test_public.tbl1
                    SET id = 22, fname = 'JJJohn2' WHERE id = 21`
                );

                await new Promise((r) => setTimeout(r, 100));

                expect(eventsCollector.events).to.have.lengthOf(2);
                expect(eventsCollector.events).to.deep.eq([
                    {
                        type: 'insert',
                        newHash: '[[1]]',
                        new: { '?column?': 'Hey:----:Hi' }
                    },
                    {
                        type: 'update',
                        oldHash: '[[21]]',
                        old: undefined,
                        newHash: '[[22]]',
                        new: { '?column?': 'JJJohn2:----:x2@x.com' }
                    }
                ]);

                await qw.disconnect();
            });

            let schemaInference;
            it('should do basic reactivity for a basic two-table query', async () => {

                schemaInference = new SchemaInference({ driver });
                await schemaInference.provide([{ schema: 'lq_test_private', tables: ['tbl1', 'tbl2'] }]);

                const sql = `
                SELECT fname || ':----:' || email || ':----:' || tbl2.email FROM lq_test_private.tbl1
                LEFT JOIN lq_test_private.tbl2 ON tbl1.id = tbl2.id
                WHERE tbl1.id > 0`;
                const _query = await registry.SelectStmt.parse(sql);
                const query = _query.deSugar(true, {}, null, schemaInference);

                await driver.query(`
                    INSERT INTO lq_test_private.tbl1 (fname, email)
                    VALUES ('John1', 'ja-1@xx.com'), ('John2', 'ja-2@xx.com');
                    INSERT INTO lq_test_private.tbl2 (id, fname, email)
                    VALUES (1, 'John1', 'jb-1@xx.com'), (3, 'John3', 'jb-3@xx.com')`
                );

                await new Promise((r) => setTimeout(r, 100));

                const qw = new QueryWindow(driver, query);
                qw.on('error', (e) => console.error(e));

                const eventsCollector = collectEvents();
                qw.on('mutation', eventsCollector.listener);

                const initialResult = await qw.initialResult();

                expect(initialResult.rows).to.have.lengthOf(2);
                expect(initialResult.rows).to.deep.eq([
                    { '?column?': 'John1:----:ja-1@xx.com:----:jb-1@xx.com' },
                    { '?column?': 'John2:----:ja-2@xx.com:----:' }
                ]);

                await driver.query(`
                    UPDATE lq_test_private.tbl2 SET id = 2 WHERE id = 3`
                );

                await new Promise((r) => setTimeout(r, 200));

                await driver.query(`
                    DELETE FROM lq_test_private.tbl1 WHERE id = 2`
                );

                await new Promise((r) => setTimeout(r, 200));

                expect(eventsCollector.events).to.have.lengthOf(2);
                expect(eventsCollector.events).to.deep.eq([
                    {
                        type: 'update',
                        oldHash: '[[2],null]',
                        old: undefined,
                        newHash: '[[2],[2]]',
                        new: { '?column?': 'John2:----:ja-2@xx.com:----:jb-3@xx.com' }
                    },
                    { type: 'delete', oldHash: '[[2],[2]]', old: undefined }
                ]);

                await qw.disconnect();
            });

            it('should do basic reactivity for a two-table query with one derived', async () => {

                const sql = `
                SELECT fname || ':----:' || email || ':----:' || tbl2.email FROM lq_test_private.tbl1
                LEFT JOIN (SELECT * FROM lq_test_private.tbl2) AS tbl2 ON tbl1.id = tbl2.id
                WHERE tbl1.id > 0`;

                const _query = await registry.SelectStmt.parse(sql);
                const query = _query.deSugar(true, {}, null, schemaInference);

                const qw = new QueryWindow(driver, query);
                qw.on('error', (e) => console.error(e));

                const eventsCollector = collectEvents();
                qw.on('mutation', eventsCollector.listener);

                const initialResult = await qw.initialResult();

                expect(initialResult.rows).to.have.lengthOf(1);
                expect(initialResult.rows).to.deep.eq([
                    { '?column?': 'John1:----:ja-1@xx.com:----:jb-1@xx.com' },
                ]);

                await driver.query(`
                    INSERT INTO lq_test_private.tbl1 (id, fname, email)
                    VALUES (2, 'John2', 'ja-2@xx.com')`
                );

                await new Promise((r) => setTimeout(r, 100));

                expect(eventsCollector.events).to.have.lengthOf(1);
                expect(eventsCollector.events).to.deep.eq([
                    {
                        type: 'insert',
                        newHash: '[[2],[2]]',
                        new: { '?column?': 'John2:----:ja-2@xx.com:----:jb-3@xx.com' }
                    }
                ]);

                eventsCollector.events.length = 0;

                await driver.query(`
                    DELETE FROM lq_test_private.tbl2 WHERE id = 2`
                );

                await new Promise((r) => setTimeout(r, 200));

                expect(eventsCollector.events).to.have.lengthOf(1);
                expect(eventsCollector.events).to.deep.eq([
                    {
                        type: 'update',
                        oldHash: '[[2],[2]]',
                        old: undefined,
                        newHash: '[[2],null]',
                        new: { '?column?': 'John2:----:ja-2@xx.com:----:' }
                    }
                ]);

                await qw.disconnect();
            });
        });
    });
});