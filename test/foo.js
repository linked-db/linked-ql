  
/**
 * @imports
 */
import pg from 'pg';
import SQLClient from '../src/api/sql/SQLClient.js';

const pgClient = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await pgClient.connect();
const lqlClient = new SQLClient(pgClient, { dialect: 'postgres' });

console.log('DROP 3', await lqlClient.query('DROP TABLE if exists public.books'));
console.log('DROP 2', await lqlClient.query('DROP TABLE if exists public.users'));
console.log('DROP 1', await lqlClient.query('DROP TABLE if exists public.roles'));

console.log('....create roles......', await lqlClient.query(`CREATE TABLE roles (
    id int primary key generated always as identity,
    name varchar,
    created_time timestamp
)`, { savepointDesc: 'Created roles' }));

console.log('.....create users.....', await lqlClient.query(`CREATE TABLE users (
    id int primary key generated always as identity,
    title varchar,
    name varchar,
    role int references roles (id),
    created_time timestamp
)`, { savepointDesc: 'Created users' }));

console.log('.....create books.....', await lqlClient.query(`CREATE TABLE books (
    id int primary key generated always as identity,
    title varchar,
    content varchar,
    author int references users (id),
    created_time timestamp
)`, { savepointDesc: 'Created books' }));

console.log(await (await lqlClient.database('public').savepoint()).getAssociatedSnapshots());

await lqlClient.query(`INSERT INTO roles (name, created_time) VALUES ('admin', now()), ('guest', now())`);
await lqlClient.query(`INSERT INTO users (title, name, role, created_time) VALUES ('Mr.', 'Ox-Harris', 1, now()), ('Mrs.', 'Jane', 2, now())`);
await lqlClient.query(`INSERT INTO books (title, content, author, created_time) VALUES ('Rich Dad & Poor Dad', 'content...1', 1, now()), ('Beauty & the Beast', 'content...2', 2, now())`);

//const ww = await lqlClient.query(`SELECT title, content, author ~> name, author ~> role ~> name role_name FROM books`);
const ww = await lqlClient.query(`SELECT name, role <~ author <~ books ~> title FROM roles`);


console.log(ww);
console.log('the end.');
