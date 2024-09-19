 
/**
 * @imports
 */
import pg from 'pg';
import { expect } from 'chai';
import SQLClient from '../src/api/sql/SQLClient.js';

// --------------------------
const pgClient = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await pgClient.connect();
let explain;
let $pgClient = { query(sql, ...args) {
    //console.log(`\n\n\n\nSQL:`, sql);
    return pgClient.query(sql, ...args);
} };
const sqlClient = new SQLClient($pgClient, { dialect: 'postgres' });
// --------------------------
const $tables = async dbName => (await sqlClient.structure({ depth: 1 })).database(dbName).tables();

describe(`Postgres Savepoints & Rollbacks`, function() {

    before(async function() {
        const linkedDB = await sqlClient.linkedDB(true);
        await linkedDB.table('savepoints').delete(true);
        const struct = await sqlClient.structure({ depth: 1 });
        console.log('---DATABSES BEFORE:', struct.databases()/*, (await sqlClient.driver.query(`ALTER schema private RENAME to public`))*/);
        console.log('---PUBLIC TABLES BEFORE:', struct.database('public')?.tables());
    });

    after(async function() {
        const struct = await sqlClient.structure({ depth: 1 });
        console.log('DROP 3', await sqlClient.query('DROP TABLE if exists public.test2 CASCADE', { noCreateSavepoint: true }));
        console.log('DROP 5', await sqlClient.query('DROP SCHEMA if exists obj_information_schema CASCADE', { noCreateSavepoint: true }));
        console.log('DROP 5', await sqlClient.query('DROP SCHEMA if exists "some_db" CASCADE', { noCreateSavepoint: true }));
        console.log('DROP 5', await sqlClient.query('DROP SCHEMA if exists "some_db.new" CASCADE', { noCreateSavepoint: true }));
        console.log('---PUBLIC TABLES AFTER:', struct.database('public').tables());
        console.log('---DATABSES AFTER:', struct.databases());
    });

    const desc0 = `Re-name DB "public" to "private".`;
    describe(`Rename DB and rollback`, function() {
        // Globals
        let publicBefore = 'public', publicAfter = 'private', savepoint0;

        it(`DO: ${ desc0 }`, async function() {
            savepoint0 = await sqlClient.alterDatabase(publicBefore, dbSchema => {
                dbSchema.name(publicAfter);
            }, {
                description: 'Rename to private',
            });
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.includes(publicAfter).and.not.includes(publicBefore);
        });

        it(`ROLLBACK: ${ desc0 }`, async function() {
            //throw new Error();
            const success = await savepoint0.rollback();
            expect(success).to.be.true;
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.includes(publicBefore).and.not.includes(publicAfter);
        });

        it(`ROLLFORWARD: ${ desc0 }`, async function() {
            const savepoint = await sqlClient.database(publicBefore).savepoint({ direction: 'forward' });
            const success = await savepoint.rollback();
            expect(success).to.be.true;
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.includes(publicAfter).and.not.includes(publicBefore);
        });

        it(`ROLLBACK (2): ${ desc0 }`, async function() {
            const savepoint = await sqlClient.database(publicAfter).savepoint();
            const success = await savepoint.rollback();
            expect(success).to.be.true;
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.includes(publicBefore).and.not.includes(publicAfter);
        });

        it(`ADD TABLE "test2"`, async function() {
            const tblCreateRequest = {
                name: 'test2',
                columns: [
                    { name: 'id', type: 'int', primaryKey: true },
                ]
            };
            const tblSavepoint = await sqlClient.database(publicBefore).createTable(tblCreateRequest, { ifNotExists: true });
            const tables = await $tables(publicBefore);
            expect(tables).to.be.an('array').that.includes('test2');
        });

    });

    const desc1 = `Create DB "some_db" with two tables: "users" and "books".`;
    describe(`Create fresh DB of two tables and rollback`, function() {

        const dbCreateRequest = {
            name: 'some_db',
            tables: [{
                name: 'users',
                columns: [
                    { name: 'id', type: 'int', primaryKey: true },
                    { name: 'fname', type: 'varchar' },
                    { name: 'lname', type: 'varchar' },
                    { name: 'age', type: 'int' },
                    { name: 'parent', type: 'int', references: { targetTable: 'users', targetColumns: ['id'] } },
                ]
            }, {
                name: 'books',
                columns: [
                    { name: 'id', type: 'int', primaryKey: true },
                    { name: 'author1', type: 'int', references: { targetTable: 'users', targetColumns: ['id'] }, },
                    { name: 'author2', type: 'int', },
                    { name: 'content', type: ['varchar', 30], default: { expr: '\'Hello world\'' }, },
                    { name: 'isbn', type: 'int', identity: { always: false }, notNull: true },
                ],
                constraints: [
                    { type: 'FOREIGN_KEY', columns: ['author2'], targetTable: 'users', targetColumns: ['id'] },
                    { type: 'UNIQUE_KEY', columns: ['author2', 'author1'] },
                ],
                indexes: []
            }]
        };

        let savepoint0, someDb;

        it(`DO: ${ desc1 }`, async function() {
            savepoint0 = await sqlClient.createDatabase(dbCreateRequest);
            someDb = sqlClient.database(dbCreateRequest.name);
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await $tables(dbCreateRequest.name);
            expect(tables).to.be.an('array').that.have.members(['books','users']);
        });

        it(`ROLLBACK: ${ desc1 } (BY DROPPING DB)`, async function() {
            const success = await savepoint0.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.not.includes('some_db');
        });

        it(`ROLLFORWARD: ${ desc1 } (BY RECREATING DB & TABLES)`, async function() {
            // Remeber savepoint0? Let's assert that we can't rollback (since it's been rolled back)
            expect(await savepoint0.isNextPointInTime()).to.be.false;
            const savepoint = await someDb.savepoint({ direction: 'forward' });
            const success = await savepoint.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['users','books']);
            // Call out savepoint0! Let's assert that now we can rollback (since it's been rolled forward)
            expect(await savepoint0.isNextPointInTime()).to.be.true;
        });

        it(`ROLLBACK: ${ desc1 } (BY DROPPING DB)`, async function() {
            const savepoint = await someDb.savepoint();
            const success = await savepoint.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.not.includes('some_db');
        });

        it(`ROLLFORWARD: ${ desc1 } (BY RECREATING DB & TABLES)`, async function() {
            const savepoint = await someDb.savepoint({ direction: 'forward' });
            const success = await savepoint.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = (await sqlClient.structure()).databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['users','books']);
        });

        it(`ADD TABLE "test1"`, async function() {
            const tblCreateRequest = {
                name: 'test1',
                columns: [
                    { name: 'id', type: 'int', primaryKey: true },
                ]
            };
            const tblSavepoint = await someDb.createTable(tblCreateRequest);
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['books','test1','users',]);
            //TODO:const tblSavepointDetails = await someDb.table('test1').savepoint();
            //TODO:expect(await tblSavepointDetails.context.status()).to.be.an('object').with.property('isNextPointInTime', true);
        });

        it(`ALTER whole DB`, async function() {
            const dbAlterRequest = {
                name: 'some_db',
                tables: ['users', 'books', 'test1'],
            };
            const savepoint3 = await sqlClient.alterDatabase(dbAlterRequest, dbSchema => {
                // Rename DB
                dbSchema.name('some_db.new');
                // Modify column
                dbSchema.table('users').column('id').uniqueKey(true);
                // Remove test1 table
                dbSchema.table('test1').drop();
                /// Add table test2
                dbSchema.table({
                    name: 'test2',
                    columns: [
                        { name: 'id', type: 'int', primaryKey: true },
                    ]
                });
            });
            const someDb = sqlClient.database('some_db.new');
            const tables = await $tables(someDb.name);
            expect(tables).to.be.an('array').that.have.members(['users','books','test2']);
            const users = (await sqlClient.structure({ depth: 2 })).database('some_db.new').table('users');
            expect(users.column('id').uniqueKey()).to.be.an('object');

            //console.log((await pgClient.query(`SELECT * FROM obj_information_schema.database_savepoints ORDER BY savepoint_date ASC`)).rows);
        });

    });

});
