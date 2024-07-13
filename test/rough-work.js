
import pg from 'pg';
import mysql from 'mysql2';
import CreateTable from '../src/query/create/CreateTable.js';
import SQLClient from '../src/api/sql/SQLClient.js';

// PG Client
const pgClient = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await pgClient.connect();

/*
// MySQL Client
const mysqlClient = await mysql.createConnection({
	host: 'localhost',
    port: 3306,
	//user: 'root',
    //password: '',
    database: 'public',
});
*/

const globalParams = {};
const client = {
    query(sql, ...args) {
        if (globalParams.showSql) {
            console.log('SQL:', sql);
        }
        return pgClient.query(sql, ...args);
    }
};
const dialect = 'postgres';

//if (dialect === 'mysql') { await client.query(`CREATE DATABASE IF NOT EXISTS public`); }
//console.log(await client.query(`SELECT * FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS`));
console.log(await client.query(`DROP SCHEMA IF EXISTS obj_information_schema CASCADE`));

const sqlClient = new SQLClient(client, { dialect });
const dbName = 'public2', dbName2 = 'public';

console.log('..............', await sqlClient.databases());
console.log('..............', await sqlClient.database(dbName).tables());

const savepoint = await sqlClient.alterDatabase(dbName, dbSchema => {
    dbSchema.name(dbName);
}, { savepointDesc: 'To public2' });

console.log('............../////////////// alter public db', savepoint?.toJson());
console.log('ALTER DATABASE public', await savepoint?.rollback());





const publicDb = sqlClient.database(dbName2);
console.log('public@', (await publicDb.savepoint({ direction: 'forward' }))?.toJson());

const booksTbl = {
    name: 'books',
    columns: [
        { name: 'id', type: 'int', primaryKey: true },
        { name: 'author1', type: 'int', references: { targetTable: 'books', targetColumns: ['id'] }, },
        { name: 'author2', type: 'int', },
        { name: 'content', type: { name: 'varchar', precision: 30 }, default: '\'Hello world\'', },
        { name: 'isbn', type: 'int', identity: { always: false }, notNull: true },
    ],
    constraints: [
        { type: 'FOREIGN_KEY', columns: ['author2'], targetTable: 'books', targetColumns: ['id'] },
        { type: 'UNIQUE_KEY', columns: ['author2', 'author1'] },
    ],
    indexes: []
};

await publicDb.dropTable(booksTbl.name, { ifExists: true });
console.log('HAS?', await publicDb.hasTable('books'), 'THEN, CREATE TABLE books IF NOT EXISTS, then DESCRIBE');
const t = await publicDb.createTable(booksTbl, { ifNotExists: true });
const booksSchema = await publicDb.describeTable('books');
console.log('SCHEMA',booksSchema);

console.log(CreateTable.fromJson(publicDb, booksSchema) + '');

const tt = await publicDb.alterTable('books', tblSchema => {
    tblSchema.column('isbn').identity(false);
});


/*
await sqlClient.dropDatabase('some_db', { ifExists: true, cascade: true });
await sqlClient.dropDatabase('some_new_db', { ifExists: true, cascade: true });
await sqlClient.dropDatabase('new_db_name', { ifExists: true, cascade: true });
*/
await client.query(`DROP SCHEMA IF EXISTS some_db CASCADE`);
await client.query(`DROP SCHEMA IF EXISTS new_db_name CASCADE`);
await client.query(`DROP SCHEMA IF EXISTS some_new_db CASCADE`);

console.log('-----------------------------||-----------------------------------');

// ----------------
// Create database
const dbCreateRequest = {
    name: 'some_db',
    tables: [{
        name: 'test0',
        columns: [
            { name: 'id', type: 'int', primaryKey: true },
        ],
        constraints: [{
            type: 'UNIQUE_KEY',
            name: 'uniiiiiiiiiiiiiique',
            columns: ['id'],
        }]
    },
    booksTbl,
]};


await sqlClient.database('obj_information_schema').table('database_savepoints').deleteAll();
const savepoint0 = await sqlClient.createDatabase(dbCreateRequest);

console.log('-----------------------------|||-----------------------------------');

const dbApi = sqlClient.database(dbCreateRequest.name);
//const savepoint0 = await sqlClient.alterDatabase(dbCreateRequest.name, dbSchema => dbSchema.name = 'some_new_db');
//globalParams.showSql = true;

console.log('---------------------------------------rolling back to CREATION POINT (DROP DB):', savepoint0.toJson());
console.log('---------------------------------------rollback done:', await savepoint0.rollback({ allowMutateDB: true }));
console.log(':::::::::::::::::------------', '' instanceof String, await sqlClient.database('obj_information_schema').table('database_savepoints').getAll());

//console.log('\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\', savepoint0.toJson());
console.log((await dbApi.savepoint({ direction: 'forward' }))?.toJson(), (await client.query(`SELECT * FROM obj_information_schema.database_savepoints ORDER BY savepoint_date ASC`)).rows);

const savepoint1 = await dbApi.savepoint({ direction: 'forward' });
console.log('\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ rolling forward to DROP POINT (RECREATE DB)', savepoint1.toJson());
console.log('--------------------------------------- rollback forward to recreate', await savepoint1.rollback({ allowMutateDB: true }));

console.log((await dbApi.savepoint({force: true}))?.toJson(), (await client.query(`SELECT * FROM obj_information_schema.database_savepoints ORDER BY savepoint_date ASC`)).rows);

// ----------------
// Create table test1
const tblCreateRequest = {
    name: 'test1',
    columns: [
        { name: 'id', type: 'int', primaryKey: true },
    ]
};
const savepoint2 = await dbApi.createTable(tblCreateRequest);

// ----------------
// Alter database (batch)
const dbAlterRequest = {
    name: 'some_db',
    tables: ['test0', 'test1', 'books'],
};
const savepoint3 = await sqlClient.alterDatabase(dbAlterRequest, dbSchema => {
    // Rename DB
    dbSchema.name('new_db_name');
    // Modify column
    dbSchema.table('test0').column('id').identity(true);
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

console.log('````````````````````````````````````````````', (await sqlClient.database('new_db_name').describeTable('test0')).columns);
await savepoint3.rollback();

/*
console.log('ALTER TABLE books', tt);
console.log(await publicDb.table('books').savepoint());

// --------------------------------------------

console.log('');
console.log('');
console.log('Parse ALTER TABLE');
console.log('');

const result6 = await Parser.parse(alterTableSql);
console.log(JSON.stringify(result6.toJson(), null, 3));

console.log(result6 + '');
console.log(AlterTable.fromJson(result6.toJson(), result6.params) + '');

// --------------------------------------------


console.log('');
console.log('');
console.log('DIFF >>> ALTER TABLE');
console.log('');

const schemaA = {
    name: 'testt',
    database: 'public',
    columns: [
        { name: 'id', type: { name: 'VARCHAR', maxLen: 30 }, default: 20 },
        { name: 'author', type: { name: 'INT' }, references: { constraintName: 'fkk', table: 'table1', columns: ['col3', 'col4']} },
    ],
    constraints: [
        { type: 'FOREIGN KEY', columns: ['col1', 'col2'], references: { table: 'table1', columns: ['col3', 'col4']} },
        { type: 'PRIMARY KEY', columns: 'col5' },
    ],
    indexes: []
};

const schemaB = {
    name: 'testt',
    database: 'public2',
    columns: [
        { name: 'id3', $name: 'id', notNull: true, type: { name: 'vARCHAR', maxLen: 70 }, default: 20 },
        { name: 'author', type: { name: 'INT' }, references: { constraintName: 'fkk222', $constraintName: 'fkk', table: 'table1', columns: ['col3', 'col5']} },
    ],
    constraints: [
        { type: 'FOREIGN KEY', columns: ['col1', 'col2'], references: { table: 'table1', columns: ['col3', 'col4']} },
        { type: 'PRIMARY KEY', columns: 'col5' },
    ],
    indexes: []
};

const result7 = AlterTable.fromDiffing(schemaA, schemaB);
console.log(JSON.stringify(result7.toJson(), null, 3));

console.log(result7 + '');
console.log(AlterTable.fromJson(result7.toJson(), result7.params) + '');
*/

process.exit();