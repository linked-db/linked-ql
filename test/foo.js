  
/**
 * @imports
 */
import pg from 'pg';
import mariadb from 'mariadb';
import SQLClient from '../src/api/sql/SQLClient.js';

let driver, dialect = 'postgres', dbPublic;
// ---------------------------------
if (dialect === 'mysql') {
    // JSON support: MariaDB 10.2.7, MySQL 5.7.8
    // DEFAULT (uuid()) support: MariaDB 10.3, MySQL 8.0
    driver = await mariadb.createConnection({
        host: '127.0.0.1',
        user: 'root',
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
const lqlClient = new SQLClient({
    query(...args) {
        return .query(...args)
    }
}, { dialect });

/*
*/
const linkedDB = await lqlClient.linkedDB(true);
//await linkedDB.uninstall(true);
await linkedDB.table('savepoints').delete(true);
console.log('---DATABSES BEFORE:', (await lqlClient.structure()).databases());
console.log('---PUBLIC TABLES BEFORE:', (await lqlClient.structure({ depth: 1 })).database(dbPublic).tables());
console.log('DROP 5', await lqlClient.query(`DROP SCHEMA if exists test_db${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 3', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.books${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 2', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.users${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 1', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.roles${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));

console.log('....create roles......', await lqlClient.query(`CREATE TABLE roles (
    id int primary key generated always as identity,
    name varchar(100),
    created_time timestamp
)`, { desc: 'Created roles' }));
const savepoint1 = await lqlClient.database(dbPublic).savepoint();

console.log('.....create users.....', await lqlClient.query(`CREATE TABLE users (
    id int primary key generated always as identity,
    title varchar(100) default '...',
    name varchar(100) unique,
    role int references roles (id),
    created_time timestamp
)`, { desc: 'Created users' }));
const savepoint2 = await lqlClient.database(dbPublic).savepoint();

console.log('.....create test_db.....', await lqlClient.query(`CREATE SCHEMA test_db`));
const savepoint2b = await lqlClient.database('test_db').savepoint();
console.log('.....create test_db.users.....', await lqlClient.query(`CREATE TABLE test_db.test_users (
    id int primary key generated always as identity,
    title varchar(100),
    name varchar(100),
    created_time timestamp
)`, { desc: 'Created users' }));
const savepoint2c = await lqlClient.database('test_db').savepoint();

console.log('.....create books.....', await lqlClient.query(`CREATE TABLE books (
    id int primary key generated by default as identity,
    title varchar(100),
    content varchar(100),
    author int references users (id),
    created_timeeee timestamp (3)
)`, { desc: 'Created books' }));
const savepoint3 = await lqlClient.database(dbPublic).savepoint();
console.log('\n\n\n\n\n\ntables---------', (await lqlClient.structure({ depth: 1 })).database(dbPublic).tables());

console.log('\n\n\n\n\n\nAll savepoints now-----', ...(await linkedDB.table('savepoints').select()));
console.log('rollback 3', await savepoint3.rollback());
console.log('rollback 2', await savepoint2.rollback());
console.log('rollback 1', await savepoint1.rollback());


let spliceForwardHistories = false;
if (spliceForwardHistories) {
    console.log('.....create publications.....', await lqlClient.query(`CREATE TABLE publications (
        id int primary key generated always as identity,
        title varchar(100),
        content varchar(100),
        created_time timestamp
    )`, { desc: 'Created publications' }));
    const savepoint4 = await lqlClient.database(dbPublic).savepoint();
    // Should see: 1,2,3,7
    console.log('\n\n\n\n\n\nall savepoints-----', ...(await linkedDB.table('savepoints').select()));
} else {
    // Roll forward
    for (let i = 0; i < 3; i ++) {
        await (await lqlClient.database(dbPublic).savepoint({ direction: 'forward' })).rollback();
    }
    // Should see: 1,2,3
    console.log('\n\n\n\n\n\nAll savepoints-----', ...(await linkedDB.table('savepoints').select()));

    await lqlClient.query(`INSERT INTO public.roles (name, created_time) VALUES ('admin', now()), ('guest', now())`);
    await lqlClient.query(`INSERT INTO users (title, name, role, created_time) VALUES ('Mr.', 'Ox-Harris', 1, now()), ('Mrs.', 'Jane', 2, now()), ('Mrs.', 'Jane2', { "name": "guest2", "created_time": null }, now())`);
    const tt = await lqlClient.query(`INSERT INTO books (title, content, author, created_timeeee) VALUES ('Rich Dad & Poor Dad', 'content...1', 1, now()), ('Beauty & the Beast', 'content...2', 2, now())`);
    const yy = await lqlClient.query(`INSERT INTO public.roles (name, created_time, "users:role") VALUES ('guest3', now(), [{ "name": "New User1" }, { "name": "New User2" }]) returning *`);
    console.log('\n\n\n\n',tt,'\n\n\n\n',yy);
    console.log('All roles', await lqlClient.database('public').table('roles').select());
    console.log('All users', await lqlClient.database('public').table('users').select());

    //const ww = await lqlClient.query(`SELECT title, content, author ~> name, author ~> role ~> name role_name FROM books as BBBBB where author ~> role ~> name = 'admin'`);
    const ww = await lqlClient.query(`SELECT name, role <~ author <~ books ~> title FROM roles`);
    //const ww = await lqlClient.query(`SELECT users.name, roles.name as role_name FROM users LEFT JOIN roles ON roles.id = users.role where roles.name = ${ dialect === 'mysql' ? '?' : '$1' }`, { values: ['admin'] });
    console.table(ww);
    console.log(await lqlClient.database('public').table('users').upsert({ title: 'Untitled', name: 'Jude' }, { returning: '*' }));
    console.log(await lqlClient.database('public').table('users').upsert({ title: 'Untitled', name: 'Jude' }, { returning: '*' }));
    console.log(await lqlClient.database('public').table('users').select({ where: 2 }));
}


// Clean up
console.log('DROP 3', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.books${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 2', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.users${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 1', await lqlClient.query(`DROP TABLE if exists ${ dbPublic }.roles${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('DROP 5', await lqlClient.query(`DROP SCHEMA if exists test_db${ dialect === 'mysql' ? '' : ' CASCADE' }`, { noCreateSavepoint: true }));
console.log('---PUBLIC TABLES AFTER:', (await lqlClient.structure({ depth: 1 })).database(dbPublic).tables());
console.log('---DATABSES AFTER:', (await lqlClient.structure()).databases());


await linkedDB.table('savepoints').delete(true);
console.log('the end.');
process.exit();
