import pg from 'pg';
import { expect } from 'chai';
import { SQLClient } from '../src/index.js';

// --------------------------
const pgClient = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await pgClient.connect();
const client = new SQLClient(pgClient, { dialect: 'postgres' });
// --------------------------

const $tables = async (dbName) => await client.database(dbName).tables();

describe(`Postgres Savepoints & Rollbacks`, function() {

    before(async function() {
        //await client.query('ALTER SCHEMA private RENAME TO public', { inspect: true, noCreateSavepoint: true }));
        console.log('DATABSES BEFORE:', await client.databases());
        await client.query('DROP TABLE if exists public.test1 CASCADE', { noCreateSavepoint: true });
        await client.query('DROP TABLE if exists public.test2 CASCADE', { noCreateSavepoint: true });
        await client.query('DROP SCHEMA if exists obj_information_schema CASCADE', { noCreateSavepoint: true });
        await client.query('DROP SCHEMA if exists "some_db" CASCADE', { noCreateSavepoint: true });
        await client.query('DROP SCHEMA if exists "some_db.new" CASCADE', { noCreateSavepoint: true });
        const linkedDB = await client.linkedDB(true);
        await linkedDB.table('savepoints').delete(true);
    });

    after(async function() {
        console.log('DATABSES AFTER:', await client.databases());
        await client.query('DROP TABLE if exists public.test1 CASCADE', { noCreateSavepoint: true });
        await client.query('DROP TABLE if exists public.test2 CASCADE', { noCreateSavepoint: true });
        await client.query('DROP SCHEMA if exists obj_information_schema CASCADE', { noCreateSavepoint: true });
        await client.query('DROP SCHEMA if exists "some_db" CASCADE', { noCreateSavepoint: true });
        await client.query('DROP SCHEMA if exists "some_db.new" CASCADE', { noCreateSavepoint: true });
    });

    const desc0 = `Re-name DB "public" to "private".`;
    describe(`Rename DB and rollback`, function() {
        // Globals
        let publicBefore = 'public', publicAfter = 'private', savepoint0;

        it(`DO: ${ desc0 }`, async function() {
            savepoint0 = await client.alterDatabase(publicBefore, dbSchema => {
                dbSchema.name(publicAfter);
            }, {
                desc: 'Rename to private',
            });
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.includes(publicAfter).and.not.includes(publicBefore);
        });

        it(`ROLLBACK: ${ desc0 }`, async function() {
            //throw new Error();
            const success = await savepoint0.rollback();
            expect(success).to.be.true;
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.includes(publicBefore).and.not.includes(publicAfter);
        });

        it(`ROLLFORWARD: ${ desc0 }`, async function() {
            const savepoint = await client.database(publicBefore).savepoint({ direction: 'forward' });
            const success = await savepoint.recommit();
            expect(success).to.be.true;
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.includes(publicAfter).and.not.includes(publicBefore);
        });

        it(`ROLLBACK (2): ${ desc0 }`, async function() {
            const savepoint = await client.database(publicAfter).savepoint();
            const success = await savepoint.rollback();
            expect(success).to.be.true;
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.includes(publicBefore).and.not.includes(publicAfter);
        });

        it(`ADD TABLE "test2"`, async function() {
            const tblCreateRequest = {
                name: 'test2',
                columns: [
                    {
                        name: 'id',
                        type: 'int',
                        primaryKey: true
                    },
                ]
            };
            await client.database(publicBefore).createTable(tblCreateRequest, { ifNotExists: true });
            const tables = await $tables(publicBefore);
            expect(tables).to.be.an('array').that.includes('test2');
        });

    });

    const desc1 = `Create DB "some_db" with two tables: "users" and "books".`;
    describe(`Create fresh DB of two tables and rollback`, function() {
        const dbCreateRequest = {
            name: 'some_db',
            tables: [
                {
                    name: 'users',
                    columns: [
                        { name: 'id', type: 'int', primaryKey: true },
                        { name: 'fname', type: 'varchar' },
                        { name: 'lname', type: 'varchar' },
                        { name: 'age', type: 'int' },
                        { name: 'parent', type: 'int', foreignKey: { targetTable: ['some_db','users'], targetColumns: ['id'] } },
                    ]
                },
                {
                    name: 'books',
                    columns: [
                        { name: 'id', type: 'int', primaryKey: true },
                        { name: 'author1', type: 'int', foreignKey: { targetTable: ['some_db','users'], targetColumns: ['id'] }, },
                        { name: 'author2', type: 'int', },
                        { name: 'content', type: ['varchar', 30], default: { expr: (q) => q.value('Hello world') }, },
                        { name: 'isbn', type: 'int', identity: { always: false }, notNull: true },
                    ],
                    constraints: [
                        { type: 'FOREIGN_KEY', columns: ['author2'], targetTable: ['some_db','users'], targetColumns: ['id'] },
                        { type: 'UNIQUE_KEY', columns: ['author2', 'author1'] },
                    ],
                    indexes: []
                }
            ]
        };

        let savepoint0, someDb;

        it(`DO: ${ desc1 }`, async function() {
            savepoint0 = await client.createDatabase(dbCreateRequest, { inspect: true });
            someDb = client.database(dbCreateRequest.name);
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await $tables(dbCreateRequest.name);
            expect(tables).to.be.an('array').that.have.members(['books','users']);
        });

        it(`ROLLBACK: ${ desc1 } (BY DROPPING DB)`, async function() {
            const success = await savepoint0.rollback();
            expect(success).to.be.true;
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.not.includes('some_db');
        });

        it(`ROLLFORWARD: ${ desc1 } (BY RECREATING DB & TABLES)`, async function() {
            const savepoint = await someDb.savepoint({ direction: 'forward' });
            const success = await savepoint.recommit();
            expect(success).to.be.true;
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['users','books']);
        });

        it(`ROLLBACK: ${ desc1 } (BY DROPPING DB)`, async function() {
            const savepoint = await someDb.savepoint();
            const success = await savepoint.rollback();
            expect(success).to.be.true;
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.not.includes('some_db');
        });

        it(`ROLLFORWARD: ${ desc1 } (BY RECREATING DB & TABLES)`, async function() {
            const savepoint = await someDb.savepoint({ direction: 'forward' });
            const success = await savepoint.recommit();
            expect(success).to.be.true;
            const databases = await client.databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['users','books']);
        });

        it(`ADD TABLE "test1"`, async function() {
            const tblCreateRequest = {
                name: 'test1',
                columns: [
                    {
                        name: 'id', 
                        type: 'int', 
                        primaryKey: true 
                    },
                ]
            };
            await someDb.createTable(tblCreateRequest, { inspect: true });
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['books','test1','users',]);
        });

        it(`ALTER whole DB`, async function() {
            const dbAlterRequest = {
                name: 'some_db',
                tables: ['users', 'books', 'test1'],
            };
            await client.alterDatabase(dbAlterRequest, dbSchema => {
                // Rename DB
                dbSchema.name('some_db.new');
                // Modify column
                dbSchema.table('users').column('id').check((q) => q.notEq('id', {value: 0}));
                // Remove test1 table
                dbSchema.table('test1', false);
                /// Add table test2
                dbSchema.table({
                    name: 'test2',
                    columns: [
                        { 
                            name: 'id', 
                            type: 'int', 
                            primaryKey: true 
                        },
                    ]
                });
            }, { inspect: true });
            const someDb = client.database('some_db.new');
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['users','books','test2']);
            const users = (await client.schema({ depth: 2 })).database('some_db.new').table('users');
            expect(users.column('id').check()).to.be.an('object');
        });

    });

});
