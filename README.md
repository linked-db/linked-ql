<div align="center">
    
# Linked QL

_**Get insanely productive with SQL!** Take a break from tooling overheads!_

[![npm version][npm-version-src]][npm-version-href]<!--[![npm downloads][npm-downloads-src]][npm-downloads-href]-->
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<br>

<picture>
  <source media="(max-width: 799px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-mobile-a.png?raw=true">
  <source media="(min-width: 800px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main-a.png?raw=true">
    <img src="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main-a.png?raw=true" alt="Linked QL Banner" width="100%">
</picture>

<br>

> Think a next generation database tool that makes your database interactions and schema management <ins>a breeze</ins>. Linked QL uniquely overcomes known limitations in the typical database system and the SQL language itself to get you <ins>insanely productive</ins>!

<div align="center">

[Follow](https://x.com/LinkedQL) • [Sponsor](https://github.com/sponsors/ox-harris)

Linked QL is a small JS-based database abstraction library that is usable over your DB of choice—from the server-side database system (postgres, MySQL and mariadb) to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)!

[Getting Started](https://github.com/sponsors/ox-harris) • [Features](https://github.com/sponsors/ox-harris)

</div>

<br>

<table>
<tr><th>

_What we're doing differently?_
    
</th></tr>
<tr><td>
<details _name="features" open><summary>A SQL-native experience</summary>

Whereas the typical ORM has hand-written SQL as the exception, Linked QL has it as <ins>the default</ins>, and along with that, it comes with everything that makes it all the more delightful to #usethelanguage!

##### └ *Preview:*

```js
// (a): A basic query with parameters
const result = await client.query(
    `SELECT
        name,
        email
    FROM users
    WHERE role = $1`,
    ['admin']
);
console.log(result);
```

```js
// (b): A basic DDL query
const result = await client.query(
    `CREATE TABLE users (
        id int primary key generated always as identity,
        name varchar,
        email varchar,
        phone varchar,
        role varchar,
        created_time timestamp
    )`
);
console.log(result);
```

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Powerful new syntax sugars</summary>

Model structures and traverse relationships like they were plain JSON objects—all right within the language! Meet Linked QL's set of syntax extensions to SQL that <ins>do the hard work</ins>, <ins>cut your query in half</ins>, and even <ins>save you multiple round trips</ins>! *(See ➞ [JSON Sugars](https://github.com/linked-db/linked-ql/wiki/JSON-Sugars), [Magic Paths](https://github.com/linked-db/linked-ql/wiki/Magic-Paths), [Upserts](https://github.com/linked-db/linked-ql/wiki/UPSERT))*

##### └ *Preview:*

```js
// (a): JSON Sugars
const result = await client.query(
    `SELECT
        name,
        { email, phone AS mobile } AS contact1,
        [ email, phone ] AS contact2
    FROM users`
);
console.log(result);
```

```js
// (b): Magic Paths
const result = await client.query(
    `SELECT
        title,
        content,
        author ~> name AS author_name
    FROM books
    WHERE author ~> role = $1`,
    ['admin']
);
console.log(result);
```

```js
// (c): Upsert
const result = await client.query(
    `UPSERT INTO public.users 
        ( name, email role )
    VALUES ( 'John Doe', 'johndoe@example.com', 'admin' ),
        ( 'Alice Blue', 'aliceblue@example.com', 'contributor' )`
);
console.log(result);
```

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Progressive enhancement</summary>

While the typical ORM often imposes a high level of abstraction where that's not desired, Linked QL offers a <ins>SQL-by-default, progressive enhancement</ins> workflow that lets you think from the ground up! And at whatever part of that spectrum you find a sweet spot, you also get the same powerful set of features that Linked QL has to offer!

##### └ *Preview:*

```js
// (a): A basic query with parameters
const result = await client.query(
    `SELECT
        name,
        email
    FROM users
    WHERE role = $1 OR role = $2`,
    ['admin', 'contributor']
);
```

```js
// (b): API equivalent 1
const result = await client.database('public').table('users').select(
    [ 'name', 'email' ],
    { where: { some: [
        { eq: ['role', { binding: 'admin' }] },
        { eq: ['role', { binding: 'contributor' }] }
    ] } }
);
```

```js
// (c): API equivalent 2
const result = await client.database('public').table('users').select(
    [ 'name', 'email' ],
    { where: (q) => q.some(
        (r) => r.eq('role', (s) => s.binding('admin')),
        (r) => r.eq('role', (s) => s.binding('contributor')),
    ) }
);
```

└ *(Details in the [Examples](https://github.com/linked-db/linked-ql/wiki/Examples) section.)*

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Automatic schema inference</summary>

Whereas the typical ORM requires you to feed them with your database schema (case in point: [Drizzle](https://orm.drizzle.team/)), Linked QL <ins>automatically infers it</ins> and magically maintains 100% schema-awareness throughout (without necessarily looking again)! You get a whole class of manual work entirely out of the equation!

##### └ *Preview:*

> ✨ Simply <ins>plug</ins> to your database and <ins>play</ins>...

```js
// Import pg and LinkedQl
import pg from 'pg';
import LinkedQl from '@linked-db/linked-ql/sql';

// Connect to an arbitrary database
const pgClient = new pg.Client({
    connectionString: process.env.SUPABASE_CONNECTION_STRING,
});
await pgClient.connect();

// Use LinkedQl as a wrapper over that
const client = new LinkedQl(pgClient, { dialect: 'postgres' });
```

> ✨ Query arbitrary structures... without the upfront schema work!

```js
const result = await client.query(
    `SELECT
        access_token,
        user_id: { email, phone, role } AS user,
        last_active
    FROM auth.users
    WHERE user_id ~> email = $1`,
    ['johndoe@example.com']
);
```

└ *(Details in the [Automatic Schema Inference](https://github.com/linked-db/linked-ql/wiki/Automatic-Schema-Inference) section.)*

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Automatic schema versioning</summary>

The typical database has no concept of versioning, but no problem, Linked QL comes with it to your database, and along with it, a powerful rollback and rollforward system! On each DDL operation you run against your database (`CREATE`, `ALTER`, `DROP`), you get a savepoint automatically created for you and a seamless rollback path you can take anytime!

##### └ *Preview:*

> ✨ Alter your database and get back a reference to a "savepoint" automatically created for you

```js
// Alter schema
const savepoint = await client.query(
    `CREATE TABLE public.users (
        id int,
        name varchar
    )`,
    { desc: 'Create users table' }
);
```

> ✨ Or obtain said savepoint on-demand

```js
const savepoint = await client.database('public').savepoint();
```

> ✨ Inspect savepoint

```js
// Some details
console.log(savepoint.versionTag()); // 1
console.log(savepoint.commitDesc()); // Create users table
console.log(savepoint.commitDate()); // 2024-07-17T22:40:56.786Z
// Everything...
console.log(savepoint.jsonfy());
```

> ✨ Roll back savepoint

```js
// SQL preview
console.log(savepoint.restorePreview()); // DROP TABLE public.users CASCADE
// Execute now (drops "users" table)
await savepoint.rollback({
    desc: 'Users table no more necessary'
});
```

└ *(Details in the [Automatic Schema Versioning](https://github.com/linked-db/linked-ql/wiki/Automatic-Schema-Versioning) section.)*

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Diff-based migrations</summary>

Whereas schema evolution remains a drag across the board, it comes as a particularly nifty experience in Linked QL! As against the conventional script-based migrations approach, Linked QL follows a diff-based approach that lets you manage your entire DB structure <ins>declaratively</ins> out of a single `schema.json` (or `schema.yml`) file!

##### └ *Preview:*

> `./database/schema.json`

```js
[
    {
        "name": "database_1",
        "tables": []
    },
    {
        "name": "database_2",
        "tables": []
    }
]
```

└ *(Details in the [Migration](https://github.com/linked-db/linked-ql/wiki/Migration) section.)*

</details>
</td></tr>
</table>






































<br>










Jump to sections and features:

+ 🎲 [Getting Started](#getting-started)
+ 🎯 [Magic Paths](#introducing-magic-paths)
+ ⛱ [Auto-Versioning](#introducing-auto-versioning)
+ ✨ [Schema-as-Code](#re-introducing-schema-as-code-with-schemajson)
+ [The Linked QL API](https://github.com/linked-db/linked-ql/wiki/API) ✈️
+ [The Linked QL CLI](https://github.com/linked-db/linked-ql/wiki/CLI) ✈️

## Getting Started

Start with near-zero setup!

Install Linked QL:

```cmd
npm install @linked-db/linked-ql
```

Obtain the Linked QL client for your target database:

1. For SQL databases, install the regular SQL client you use for your DB. (Typically, [`pg`](https://github.com/brianc/node-postgres) for PostgreSQL, [`mariadb`](https://github.com/mariadb-corporation/mariadb-connector-nodejs) for mariadb, [`mysql`](https://www.npmjs.com/package/mysql)/[`mysql2`](https://www.npmjs.com/package/mysql2) for MySQL databases.)

    Using PostgreSQL as an example, install the `pg` client:

    ```cmd
    npm install pg
    ```

    Use Linked QL as a wrapper over that:

    ```js
    // Import pg and LinkedQl
    import pg from 'pg';
    import LinkedQl from '@linked-db/linked-ql/sql';

    // Connect pg
    const pgClient = new pg.Client({
        host: 'localhost',
        port: 5432,
    });
    await pgClient.connect();

    // Use LinkedQl as a wrapper over that
    const client = new LinkedQl(pgClient, { dialect: 'postgres' });
    ```

    <details><summary>See also: sample setup for mariadb</summary>

    > **Note that your mariadb database must be `v10.5.2` or higher.** (MySQL `v8` comparably.) In addition, Linked QL needs to be able to run multiple statements in one query. The `multipleStatements` connector parameter below is thus required. We also need to have the `bitOneIsBoolean` parameter in place.

    ```js
    // Import mariadb and LinkedQl
    import mariadb from 'mariadb';
    import LinkedQl from '@linked-db/linked-ql/sql';

    // Connect pg
    const myConnection = await mariadb.createConnection({
        host: '127.0.0.1',
        user: 'root',
        port: 3306,
        // -------
        multipleStatements: true, // Required
        bitOneIsBoolean: true, // The default, but required
        trace: true, // Recommended
    });

    // Use LinkedQl as a wrapper over that
    const client = new LinkedQl(myConnection, { dialect: 'mysql' });
    ```

    </details>
    
2. For the client-side *IndexedDB*, import and instantiate the *IDB* client. _(Coming soon)_
    
    ```js
    // Import IDB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql/idb';
    
    // Create an instance.
    const client = new LinkedQl;
    ```
    
3. To work with Linked QL's in-memory object database, import and instantiate the *ODB* client. _(Coming soon)_

    ```js
    // Import ODB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql/odb';
    
    // Create an instance.
    const LinkedQlClient = new LinkedQl;
    ```

All `client` instances above implement the same interface:

```js
client.query('SELECT fname, lname FROM users WHERE role = $1', { values: ['admin'] }).then(result => {
    console.log(result);
});
```

```js
const result = await client.query('SELECT fname, lname FROM users WHERE role = $1', { values: ['admin'] });
console.log(result);
```

This API and more are covered right in the [API](https://github.com/linked-db/linked-ql/wiki/API) area. 

By design, you are able to choose between running raw SQL using `client.query()` and running equivalent statements using APIs like `client.createDatabase()`, `client.alterDatabase()`, `client.dropDatabase()`, `database.createTable()`, `database.alterTable()`, `database.dropTable()`, `table.select()`, `table.insert()`, `table.upsert()`, `table.update()`, `table.delete()`, etc. (All as covered in the [API](https://github.com/linked-db/linked-ql/wiki/API) area.)

*✨ Now, that's like: whatever your query style or usecase, there's a thing in Linked QL for you!*

## Introducing Magic Paths

💥 *Express relationships graphically! You shouldn't always have to write JOINS!*

Meet Linked QL's magic path operators, a syntax extension to SQL, that lets you connect to columns on other tables without writing a single JOIN clause. Linked QL uses heuristics on your DB structure to figure out the details and the relevant JOINS behind the scenes.

Where you normally would write...

```sql
-- Regular SQL
SELECT title, users.fname AS author_name FROM posts
LEFT JOIN users ON users.id = posts.author
```

Linked QL lets you draw a path to express the relationship:

```sql
-- Linked QL
SELECT title, author ~> fname AS author_name FROM posts
```

And here's a scenario showing a typical schema and an example query each:

```sql
-- The users table
CREATE TABLE users (
    id int primary key generated always as identity,
    title varchar,
    name varchar,
    role int references roles (id),
    created_time timestamp
);
-- The books table
CREATE TABLE books (
    id int primary key generated always as identity,
    title varchar,
    content varchar,
    author int references users (id),
    created_time timestamp
);
```

```sql
-- Regular SQL
SELECT book.id, book.title, content, book.created_time, user.id AS author_id, user.title AS author_title, user.name AS author_name 
FROM books AS book LEFT JOIN users AS user ON user.id = book.author
```

```sql
-- Linked QL
SELECT id, title, content, created_time, author ~> id, author ~> title, author ~> name 
FROM books
```

✨ _Now, that translates to about 50% code, plus whole namespacing exercise, having been eliminated! Yet, no questions asked about your schema, and none of the usual upfront relationship mapping!_

Taking things further, you are able to chain these operators to any level for your multi-level relationships:

```sql
-- Linked QL
SELECT * FROM books
WHERE author ~> role ~> codename = 'admin'
```

and for the different forms of relationships out there (one-to-many, many-to-one, many-to-many), path operators can go in any direction:

```sql
-- Linked QL
SELECT * FROM users
WHERE author <~ books ~> title = 'Beauty and the Beast'
```

Plus, with Linked QL being a *superset* of SQL, you can combine the new magic together with the old LEFT JOIN/RIGHT JOIN/etc clauses with zero implications:

```sql
-- Linked QL
SELECT users.* FROM users, some_other_table.id
LEFT JOIN some_other_table USING some_other_condition
WHERE author <~ books ~> title = 'Beauty and the Beast'
```

giving you just the right tool for the job in every scenario: the regular JOINS for whatever calls for them; magic paths for when the very JOINS are an overkill!

*✨ We think this will make a lot of your tooling and manual work around SQL obsolete and your codebase saner! You essentially get back SQL - and with it, a dose of magic!*

## Introducing Auto-Versioning

⚡️ *Create, alter, and drop schemas without needing to worry about versioning.*

<details><summary><i>You may be doing too much!</i></summary>

Databases have historically lacked the concept of versioning, and that has seen all of the engineering work pushed down to the client application. If you've ever had to adopt a special process for defining and managing your schemas, wherein changes are handled through specially-named, chronologically-ordered files within your application...

```sql
app
├─migrations
  ├─20240523_1759_create_users_table_and_drop_accounts_table
  │  └[UP]:
  │    CREATE TABLE users (id int, first_name varchar);
  │    DROP TABLE accounts;
  │
  ├─20240523_1760_add_last_login_to_users_table_and_rename_order_status_table
  │  └[UP]:
  │    ALTER TABLE users ADD COLUMN last_name varchar;
  │    ALTER TABLE order_status RENAME TO order_tracking;
  │
  ├─ +256 more...
```

with each of those also needing to be paired with a "DOWN" logic (the reverse-engineering logic):

```sql
app
├─migrations
  ├─20240523_1760_add_last_login_to_users_table_and_rename_order_status_table:
  │  └[DOWN]:
  │    ALTER TABLE users DROP COLUMN last_name;
  │    ALTER TABLE order_tracking RENAME TO order_status;
  │
  ├─20240523_1759_create_users_table_and_drop_accounts_table:
  │  └[DOWN]:
  │    DROP TABLE users;
  │    CREATE TABLE accounts (id int, first_name varchar);
  │
  ├─ +256 more...
```

then you've faced the problem that this defeciency in databases creates!

</details>

Meet Linked QL's Automatic Schema Savepoint and Rollback feature - a little addition to your database that does the heavy-lifting of schema versiong at the database level!

Here, you alter your schema and get back a reference to a "savepoint" automatically created for you:

```js
// Alter schema
const savepoint = await client.query('CREATE TABLE public.users (id int, name varchar)', {
    desc: 'Create users table'
});
```

```js
// As an axample of what you see:
console.log(savepoint.description);   // Create users table
console.log(savepoint.versionTag);    // 1
console.log(savepoint.savepointDate); // 2024-07-17T22:40:56.786Z
// Or to see everything:
console.table(savepoint.toJSON());
```

You're also able to access the same savepoint on-demand using the [`database.savepoint()`](https://github.com/linked-db/linked-ql/wiki/API#databasesavepoint) API:

```js
const savepoint = await client.database('public').savepoint();
```

Either way, you get a nifty rollback button should you want to rollback:

```js
// Rollback all associated changes (Gets the users table dropped)
await savepoint.rollback();
```

and you can roll all the way back to a point in time, should you want to:

```js
// Rollback to public@3
let savepoint;
while((savepoint = await client.database('public').savepoint()) && savepoint.versionTag <= 3) {
    await savepoint.rollback();
}
```

*✨ Now, that's a go-ahead to alter your DB carefree! But this time, in a safety net!*

Taking that further, you also get a way to *roll forward* from a rollback state! (Much like hitting "Redo" to reverse a certain "Undo").

This time, on calling `database.savepoint()`, you indicate that you want a "forward" movement from your current point in time:

```js
// "Undo" the last rollback (Gets the users table re-created)
let savepoint = await client.database('public').savepoint({ direction: 'forward' });
await savepoint.rollback();
```

You essentially get time travel in any direction - and as seamlessly as you move on a movie track!

_✨ Meanwhile, your schema histories now live **as data** (**instead of as files**), making them queryable, analyzable, and even visualizable, just as regular data! Plus, the DB now essentially becomes the absolute source of truth for both itself and its client applications!_

## Re-Introducing Schema-as-Code with `schema.json`

💥 *Have your entire DB structure live in a single `schema.json` (or `schema.yml`) file that you edit in-place!*

With schema versioning now happening at the database level, the whole concept of database migrations at the application level should also change: **no need to keep a growing list of migration files just to maintain past states**! We found that you could essentially streamline you whole "database" footprint to fit in a single `schema.json` (or `schema.yml`) file!

### `schema.json`

```js
[
    {
        // string
        "name": "database_1",
        // TableSchemaSpec[]
        "tables": []
    },
    {
        // string
        "name": "database_2",
        // TableSchemaSpec[]
        "tables": []
    }
]
```

If you had that somewhere in your application, say at `./database/schema.json`, Linked QL could help keep it in sync both ways with your database:

+ you add or remove a database object or table object or column object... and it is automatically reflected in your DB structure at the click of a command: `linkedql commit`
+ your colleague makes new changes from their codebase... and it is automatically reflected in your local copy at your next `git pull`, or at the click of a command: `linkedql refresh`

> You may want to see how that brings us to [true "Schema as Code" in practice](#test-heading).

⚡️ You also get to see a version number on each database object in your schema essentially incrementing on each migrate operation (whether by you or by colleague), and decrementing on each rollback operation (whether by you or by colleague).

To setup:

1. Make a directory within your application for database concerns. Linked QL will want to look in `./database`, but you will be able to point to your preferred location when running Linked QL commands.

2. Have a `driver.js` file in that directory that has a *default export* function that returns a Linked QL instance. This will be imported and used by Linked QL to interact with your database. This could look something like:

    ```js
    import pg from 'pg';
    import SQLClient from '@linked-db/linked-ql/sql';

    const pgClient = new pg.Client({
        host: 'localhost',
        port: 5432,
    });
    await pgClient.connect();
    const sqlClient = new SQLClient(pgClient, { dialect: 'postgres' });

    export default function() {
        return sqlClient;
    }
    ```

3. Have your DB structure defined in a `schema.json` (or `schema.yml`) file in that directory. (See [`schema.json`](#schemajson) above for a guide.)

    Now, you can always extend your DB structure with new objects, drop existsing ones, or edit them in-place. Only, for an existing database, table, column, constraint, or index, **names may be changed, but not in-place!** A "rename" operation is done with the addition of a temporary `$name` attribute:

    ```js
    {
        "name": "old_name",
        "$name": "new_name"
    }
    ```

    The old name being in place is needed to find the target during migration. The temporary `$name` attribute automatically disappears after new name has been picked up by Linked QL at next `linkedql commit`.

To run:

+ Use `linkedql commit` to walk through your staged local changes and interactively perform a migration against your database.
+ Use `linkedql rollback` to walk through the latest savepoint at each database and interactively perform a rollback.
+ Use `linkedql state` to just view the state of each database.

Details of these commands in the [CLI](https://github.com/linked-db/linked-ql/wiki/CLI#linked-ql-cli) area.

🐣 *And that's a wrap on Linked QL!*

✨ *Found this exciting? Don't forget to leave us a star.*

## DOCS

If you've made it this far, you may want to go here next:

+ The Linked QL API: [in the wiki](https://github.com/linked-db/linked-ql/wiki/API) ✈️
+ The Linked QL CLI: [in the wiki](https://github.com/linked-db/linked-ql/wiki/CLI) ✈️

## Roadmap

+ [`DONE`] Implement support for a `schema.yml` alternative to `schema.json` file.
+ [`DONE`] Support dimensional payloads at `table.insert()`, `table.upsert()`, `table.update()`.
+ [`ONGOING`] Support dimensional fields at `table.select()` and in the `returning` clause at `table.insert()`, `table.upsert()`, `table.update()`.
+ [`ONGOING`] Improve support for MySQL.
+ [`PENDING`] Implement support for IndexedDB.
+ [`PENDING`] Implement the in-memory database.
+ [`PENDING`] Implement LinkedDB Realtime.
+ [`PENDING`] Implement DB-native extensions of LinkedDB.

> Much of that could happen sooner with your support! If you'd like to help out, please consider a [sponsorship](https://github.com/sponsors/ox-harris). PRs are also always welcome.

## Issues

To report bugs or request features, please submit an issue to this repository.

## License

MIT.

[npm-version-src]: https://img.shields.io/npm/v/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/@linked-db/linked-ql
[npm-downloads-src]: https://img.shields.io/npm/dm/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/@linked-db/linked-ql
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/master/LICENSE
