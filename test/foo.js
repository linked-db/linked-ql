  
/**
 * @imports
 */
import pg from 'pg';
import mariadb from 'mariadb';
import SQLClient from '../src/api/sql/SQLClient.js';

let driver, dialect = 'mysql', dbPublic;
// ---------------------------------
if (dialect === 'mysql') {
    // JSON support: MariaDB 10.2.7, MySQL 5.7.8
    // DEFAULT (uuid()) support: MariaDB 10.3, MySQL 8.0
    driver = await mariadb.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: '',
        port: 3306,
        // -------
        database: 'test',
        multipleStatements: true,
        bitOneIsBoolean: true, // default
        trace: true,
    });
    dbPublic = 'test';
} else {
    driver = new pg.Client({
        host: 'localhost',
        port: 5432,
    });
    await driver.connect();
    dbPublic = 'public';
}
// ---------------------------------

let showQuery = false;
const lqlClient = new SQLClient({
    query() {
        if (showQuery) console.log('SQL:', ...arguments);
        return driver.query(...arguments);
    }
}, { dialect });

console.log('---DATABSES BEFORE:', await lqlClient.databases());
console.log('---PUBLIC TABLES BEFORE:', await lqlClient.database(dbPublic).tables());
/*
*/
console.log('DROP 5', await lqlClient.query(`DROP SCHEMA if exists obj_information_schema${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 5', await lqlClient.query(`DROP SCHEMA if exists test_db${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 3', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.books${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 2', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.users${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 1', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.roles${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));

console.log('....create roles......', await lqlClient.query(`CREATE TABLE roles (
    id int primary key generated always as identity,
    name varchar(100),
    created_time timestamp
)`, { description: 'Created roles' }));
const savepoint1 = await lqlClient.database(dbPublic).savepoint();

console.log('.....create users.....', await lqlClient.query(`CREATE TABLE users (
    id int primary key generated always as identity,
    title varchar(100) default '...',
    name varchar(100),
    role int references roles (id),
    created_time timestamp
)`, { description: 'Created users' }));
const savepoint2 = await lqlClient.database(dbPublic).savepoint();

console.log('.....create test_db.....', await lqlClient.query(`CREATE SCHEMA test_db`));
const savepoint2b = await lqlClient.database('test_db').savepoint();
console.log('.....create test_db.users.....', await lqlClient.query(`CREATE TABLE test_db.test_users (
    id int primary key generated always as identity,
    title varchar(100),
    name varchar(100),
    created_time timestamp
)`, { description: 'Created users' }));
const savepoint2c = await lqlClient.database('test_db').savepoint();

console.log('.....create books.....', await lqlClient.query(`CREATE TABLE books (
    id int primary key generated always as identity,
    title varchar(100),
    content varchar(100),
    author int references users (id),
    created_timeeee timestamp (3)
)`, { description: 'Created books' }));
const savepoint3 = await lqlClient.database(dbPublic).savepoint();
console.log('\n\n\n\n\n\ntables---------', await lqlClient.database(dbPublic).tables());

console.log('rollback 3', await savepoint3.rollback());
console.log('rollback 2', await savepoint2.rollback());
console.log('rollback 1', await savepoint1.rollback());

console.log('\n\n\n\n\n\nAll savepoints now-----', ...(await lqlClient.database('obj_information_schema').table('database_savepoints').select()));

let spliceForwardHistories = false;
if (spliceForwardHistories) {
    console.log('.....create publications.....', await lqlClient.query(`CREATE TABLE publications (
        id int primary key generated always as identity,
        title varchar(100),
        content varchar(100),
        created_time timestamp
    )`, { description: 'Created publications' }));
    const savepoint4 = await lqlClient.database(dbPublic).savepoint();
    // Should see: 1,2,3,7
    console.log('\n\n\n\n\n\nall savepoints-----', ...(await lqlClient.database('obj_information_schema').table('database_savepoints').select()));
} else {
    // Roll forward
    for (let i = 0; i < 3; i ++) {
        await (await lqlClient.database(dbPublic).savepoint({ direction: 'forward' })).rollback();
    }
    // Should see: 1,2,3
    console.log('\n\n\n\n\n\nAll savepoints-----', ...(await lqlClient.database('obj_information_schema').table('database_savepoints').select()));

    await lqlClient.query(`INSERT INTO roles (name, created_time) VALUES ('admin', now()), ('guest', now())`);
    await lqlClient.query(`INSERT INTO users (title, name, role, created_time) VALUES ('Mr.', 'Ox-Harris', 1, now()), ('Mrs.', 'Jane', 2, now())`);
    await lqlClient.query(`INSERT INTO books (title, content, author, created_timeeee) VALUES ('Rich Dad & Poor Dad', 'content...1', 1, now()), ('Beauty & the Beast', 'content...2', 2, now())`);

    //const ww = await lqlClient.query(`SELECT title, content, author ~> name, author ~> role ~> name role_name FROM books as BBBBB where author ~> role ~> name = 'admin'`);
    const ww = await lqlClient.query(`SELECT name, role <~ author <~ books ~> title FROM roles`);
    //const ww = await lqlClient.query(`SELECT users.name, roles.name as role_name FROM users LEFT JOIN roles ON roles.id = users.role where roles.name = ${ dialect === 'mysql' ? '?' : '$1' }`, { values: ['admin'] });
    console.log(ww);
}

// Clean up
console.log('DROP 3', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.books${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 2', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.users${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 1', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.roles${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 5', await lqlClient.query(`DROP SCHEMA if exists test_db${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 5', await lqlClient.query(`DROP SCHEMA if exists obj_information_schema${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('---PUBLIC TABLES AFTER:', await lqlClient.database(dbPublic).tables());
console.log('---DATABSES AFTER:', await lqlClient.databases());


console.log('the end.');
process.exit();
