 
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

describe(`Postgres Savepoints & Rollbacks`, function() {

    before(async function() {
        await sqlClient.dropDatabase('obj_information_schema', { ifExists: true, cascade: true, noCreateSavepoint: true });
        await sqlClient.dropDatabase('some_db', { ifExists: true, cascade: true, noCreateSavepoint: true });
        await sqlClient.dropDatabase('new_db_name', { ifExists: true, cascade: true, noCreateSavepoint: true });
        await sqlClient.alterDatabase('private', db => db.name = 'public', { ifExists: true, noCreateSavepoint: true });
        //console.log('//////////////////////', await sqlClient.databases({ force: true }));
        //console.log(await sqlClient.database('public').dropTable('test2', { cascade: true }));
        //console.log(await sqlClient.database('public').tables());
    });

    const desc0 = `Re-name DB "public" to "private".`;
    describe(`Rename DB and rollback`, function() {

        let publicDb, savepoint0;

        it(`DO: ${ desc0 }`, async function() {
            savepoint0 = await sqlClient.alterDatabase('public', dbSchema => {
                dbSchema.name = 'private';
            }, {
                savepointDesc: 'Rename to private',
            });
            publicDb = sqlClient.database('public');
            const databases = await sqlClient.databases({ force: true });
            expect(databases).to.be.an('array').that.includes('private').and.not.includes('public');
        });

        it(`ROLLBACK: ${ desc0 }`, async function() {
            const success = await savepoint0.rollback();
            expect(success).to.be.true;
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.includes('public').and.not.includes('private');
        });

        it(`ROLLFORWARD: ${ desc0 }`, async function() {
            const savepoint = await publicDb.savepoint({ direction: 'forward' });
            const success = await savepoint.rollback();
            expect(success).to.be.true;
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.includes('private').and.not.includes('public');
        });

        it(`ROLLBACK (2): ${ desc0 }`, async function() {
            const savepoint = await publicDb.savepoint();
            const success = await savepoint.rollback();
            expect(success).to.be.true;
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.includes('public').and.not.includes('private');
        });

        it(`ADD TABLE "test1"`, async function() {
            const tblCreateRequest = {
                name: 'test2',
                columns: [
                    { name: 'id', type: 'int', primaryKey: true },
                ]
            };
            const tblApi = await publicDb.createTable(tblCreateRequest, { ifNotExists: true });
            const tables = await publicDb.tables();
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
                    { name: 'parent', type: 'int', references: { table: 'users', columns: ['id'] } },
                ]
            }, {
                name: 'books',
                columns: [
                    { name: 'id', type: 'int', primaryKey: true },
                    { name: 'author1', type: 'int', references: { table: 'users', columns: ['id'] }, },
                    { name: 'author2', type: 'int', },
                    { name: 'content', type: { name: 'varchar', maxLen: 30 }, default: { expr: '\'Hello world\'' }, },
                    { name: 'isbn', type: 'int', identity: { always: false }, notNull: true },
                ],
                constraints: [
                    { type: 'FOREIGN_KEY', columns: ['author2'], references: { table: 'users', columns: ['id'] } },
                    { type: 'UNIQUE', columns: ['author2', 'author1'] },
                ],
                indexes: []
            }]
        };

        let someDb;

        it(`DO: ${ desc1 }`, async function() {
            someDb = await sqlClient.createDatabase(dbCreateRequest);
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await someDb.tables();
            expect(tables).to.be.an('array').that.eql(['users','books']);
        });

        let savepoint0;
        it(`ROLLBACK: ${ desc1 } (BY DROPPING DB)`, async function() {
            savepoint0 = await someDb.savepoint();
            const success = await savepoint0.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.not.includes('some_db');
        });

        it(`ROLLFORWARD: ${ desc1 } (BY RECREATING DB & TABLES)`, async function() {
            // Remeber savepoint0? Let's assert that we can't rollback (since it's been rolled back)
            expect((await savepoint0.status()).canRollback).to.be.false;
            const savepoint = await someDb.savepoint({ direction: 'forward' });
            const success = await savepoint.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await someDb.tables();
            expect(tables).to.be.an('array').that.eql(['users','books']);
            // Call out savepoint0! Let's assert that now we can rollback (since it's been rolled forward)
            expect((await savepoint0.status()).canRollback).to.be.true;
        });

        it(`ROLLBACK: ${ desc1 } (BY DROPPING DB)`, async function() {
            const savepoint = await someDb.savepoint();
            const success = await savepoint.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.not.includes('some_db');
        });

        it(`ROLLFORWARD: ${ desc1 } (BY RECREATING DB & TABLES)`, async function() {
            const savepoint = await someDb.savepoint({ direction: 'forward' });
            const success = await savepoint.rollback({ allowMutateDB: true });
            expect(success).to.be.true;
            const databases = await sqlClient.databases();
            expect(databases).to.be.an('array').that.includes('some_db');
            const tables = await someDb.tables();
            expect(tables).to.be.an('array').that.eql(['users','books']);
        });

        it(`ADD TABLE "test1"`, async function() {
            const tblCreateRequest = {
                name: 'test1',
                columns: [
                    { name: 'id', type: 'int', primaryKey: true },
                ]
            };
            const tblApi = await someDb.createTable(tblCreateRequest);
            const tables = await someDb.tables();
            expect(tables).to.be.an('array').that.eql(['users','books','test1']);
            const tblSavepointDetails = await someDb.table('test1').savepoint();
            expect(await tblSavepointDetails.context.status()).to.be.an('object').with.property('canRollback', true);
        });

        it(`ALTER whole DB`, async function() {
            const dbAlterRequest = {
                name: 'some_db',
                tables: ['users', 'books', 'test1'],
            };
            const savepoint3 = await sqlClient.alterDatabase(dbAlterRequest, dbSchema => {
                // Rename DB
                dbSchema.name = 'new_db_name';
                // Modify column
                dbSchema.tables.get('users').columns.get('id').uniqueKey = true;
                // Remove test1 table
                dbSchema.tables.delete('test1');
                /// Add table test2
                dbSchema.tables.push({
                    name: 'test2',
                    columns: [
                        { name: 'id', type: 'int', primaryKey: true },
                    ]
                });
            });
            expect(someDb.name).to.eql('new_db_name');
            const tables = await someDb.tables();
            expect(tables).to.be.an('array').that.eql(['users','books','test2']);
            const users = await someDb.describeTable('users', { force: true });
            expect(users.columns.find(col => col.name === 'id').uniqueKey).to.be.an('object');

            //console.log((await pgClient.query(`SELECT * FROM obj_information_schema.database_savepoints ORDER BY savepoint_date ASC`)).rows);
        });

    });

});
