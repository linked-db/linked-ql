# Linked QL

[![npm version][npm-version-src]][npm-version-href]<!--[![npm downloads][npm-downloads-src]][npm-downloads-href]-->
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

❄️ **_Save the overhead working with SQL and structured data - from the time and effort spent figuring out relational queries to the labour managing schemas!_** Try a modern, minimalistic take on SQL and databases in general!

Linked QL is a DB query client that simplfies how you interact with your database and manage your schemas.

💥 Takes the ORM and friends out of the way and let's you just write SQL, but SQL that you will actually enjoy. (Linked QL extends standard SQL with [new syntax sugars](#introducing-magic-paths) that let you write relational queries in 70% less code and without a single JOIN clause.)

⚡️ Takes the process out of schema management and lets you just *ALTER* away your DB, but in a safety net. (Linked QL extends your DB behind the scenes to [automatically version](#introducing-auto-versioning) each edit you make and have them kept as "savepoints" that you can always rollback to.)

💥 Brings the "schema-as-code" paradigm to its true meaning and essentially lets you have your entire DB structure go in a single [`schema.json` file](#re-introducing-schema-as-code-with-schemajson) that you edit in-place, as against the "hundreds of migration files" story. (Linked QL essentially rewrites that story.)

It comes as a small library and is usable over your DB of choice - from the server-side Postgres and MySQL, to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), to the plain JSON object!

Jump to sections and features:

+ [Basic Usage](#basic-usage)
+ [Magic Paths](#introducing-magic-paths)
+ [Auto-Versioning](#introducing-auto-versioning)
+ [Schema-as-Code](#re-introducing-schema-as-code-with-schemajson)
+ [API](#api)

## Setup

Install Linked QL:

```cmd
npm install @linked-db/linked-ql
```

Obtain the Linked QL client for your target database:

1. For SQL databases, install the regular SQL client you use for your DB. (Typically, `pg` for Postgres, `mysql2` for MySQL databases.)

    Given a Postgres DB, install the `pg` client:

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
    
2. For the client-side *IndexedDB*, import and instantiate the *IDB* client. _(Coming soon)_
    
    ```js
    // Import IDB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql/idb';
    
    // Create an instance.
    const client = new LinkedQl;
    ```
    
3. To work with Linked QL's in-memory object storage, import and instantiate the *ODB* client. _(Coming soon)_

    ```js
    // Import ODB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql';
    
    // Create an instance.
    const LinkedQlClient = new LinkedQl;
    ```

All `client` instances above implement the same interface:

```js
client.query('SELECT fname, lname FROM users WHERE role = $1', { params: ['admin'] }).then(result => {
    console.log(result);
});
```

```js
const result = await client.query('SELECT fname, lname FROM users WHERE role = $1', { params: ['admin'] });
console.log(result);
```

Other APIs are covered just ahead in the [API](#object-client) section.

## Introducing Magic Paths

💥 *Express relationships graphically.*

JOINS can be good, but can be a curse too, as they almost always obfuscate your entire query! But what if you didn't have to write JOINS to express same relationships?

Meet Linked QL's magic path operators, a syntax extension to SQL, that lets you connect to columns on other tables without writing a single JOIN. Linked QL uses heuristics on your DB structure to figure out the details and the relevant JOINs behind the scenes.

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

And here's a scenario showing an example schema and a typical query each:

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

✨ PRO: *About 70% code and whole namespacing exercise are now eliminated; all with zero upfront setup!*

Additionally, paths can be multi-level:

```sql
-- Linked QL
SELECT * FROM books
WHERE author ~> role ~> name = 'admin'
```

and they can also be used to express incoming references:

```sql
-- Linked QL
SELECT * FROM users
WHERE author <~ books ~> title = 'Beauty and the Beast'
```

## Introducing Auto-Versioning

⚡️ *Create, Alter, and Drop schemas without needing to worry about schema versioning.*

Databases have historically lacked the concept of schema versioning, and that has seen all the engineering work pushed down to the client application. If you've ever had to adopt a special process for defining and managing your schemas, wherein changes are handled through *serially-named* files within your application, written as an `UP`/`DOWN` pair of actions each, supported by tooling...

```js
app
  ├── migrations
    ├── 20240523_1759_create_users_table_and_drop_accounts_table.extension
    │
    │   │ UP                                       │ DOWN
    │   ├──────────────────────────────────────────┼────────────────────────────────────
    │   │ CREATE TABLE users (id INT, first_n...); │ DROP TABLE users;
    │   │ DROP TABLE accounts;                     │ CREATE TABLE accounts (id INT, first_name VAR...);
    │
    ├── 20240523_1760_add_last_login_to_users_table_and_rename_order_status_table.extension
    │
    │   │ UP                                       │ DOWN
    │   ├──────────────────────────────────────────┼────────────────────────────────────
    │   │ ALTER TABLE users ADD COLUMN last_lo...; │ ALTER TABLE users DROP COLUMN last_login;
    │   │ ALTER TABLE order_status RENAME TO o...; │ ALTER TABLE order_tracking RENAME TO order_status;
    │
    ├── +256 more files...
```

then you've faced the problem that this defeciency in databases creates! But what if databases magically got to do the heavy lifting?

Meet Linked QL's special extension of your database that does exaclty that and lets you just alter your DB however you may but in a safety net! Meet Automatic Schema Savepoints and Rollbacks!

Linked QL:

```js
// Alter schema
const savepoint = await client.query('CREATE TABLE public.users (id int, name varchar)', {
    description: 'Create users table',
});
```

```js
// Inspect the automatic savepoint created for you
console.table(savepoint.toJson());
```
>
> | Key               | Value                    |
> | :---------------- | :------                  |
> | description       | Create users table       |
> | version_tag       | 1                        |
> | savepoint_date    | 2024-07-17T22:40:56.786Z |
> | *+6 more rows...* |                          |

✨ PRO: *DB versioning concerns are now essentially taken out of the client application - to the DB itself; and with zero upfront setup!*

Now, when it's time to rollback, a magic wand button makes it all nifty:

```js
// Rollback all associated changes (Gets the users table dropped)
await savepoint.rollback();
```

and you can go many levels back:

```js
// Rollback to public@3
let savepoint;
while(savepoint = await client.database('public').savepoint()) {
    await savepoint.rollback();
    if (savepoint.versionTag === 3) break;
}
```

and you can "undo" a rollback, or in other words, roll forward to a point in time:

```js
// "Undo" the last rollback (Gets the users table re-created)
let savepoint = await client.database('public').savepoint({ direction: 'forward' });
await savepoint.rollback();
```

## Re-Introducing Schema-as-Code with `schema.json`

💥 *Have your entire DB structure live in a single `schema.json` file that you edit in-place!*

With schema versioning now having become a database-level concern, the rest of the database story at the application level should rightly experience a disruption. Linked QL goes further to streamline your application's database footprint from spanning hundreds of migration files to fitting into a single `schema.json` file!

### `schema.json`

Database objects:

```js
[
    {
        "name": "database_1", // Required
        "tables": [] // Table objects
    },
    {
        "name": "database_2", // Required
        "tables": [] // Table objects
    }
]
```

<details>
<summary>Other objects</summary>

A table object:

```js
{
    "name": "users", // Required
    "columns": [], // Column objects (min: 1)
    "constraints": [], // Constraint objects
    "indexes": [] // Index objects
}
```

A column object:

```js
{
    "name": "id", // Required
    "type": "int", // Required
    "primaryKey": true,
    "identity": true
}
```

<details>
<summary>More column objects</summary>

```js
{
    "name": "full_name",
    "type": ["varchar","101"],
    "generated": "(first_name || ' ' || last_name)"
}
```

```js
{
    "name": "email",
    "type": ["varchar","50"],
    "uniqueKey": true,
    "notNull": true,
    "check": "(email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')"
}
```

```js
{
    "name": "parent",
    "type": "int",
    "notNull": true,
    "references": {
        "targetTable": "users", // Required
        "targetColumns": ["id"], // Required
        "matchRull": "full",
        "updateRule": "cascade",
        "deleteRule": "restrict"
    }
}
```
</details>

A constraint object:

```js
{
    "type": "PRIMARY_KEY", // Required
    "columns": ["id"], // Required
    "name": "constraint_name"
}
```

<details>
<summary>More constraint objects</summary>

```js
{
    "type": "UNIQUE_KEY",
    "columns": ["email"]
}
```

```js
{
    "type": "FOREIGN_KEY",
    "columns": ["parent"],
    "targetTable": "users",
    "targetColumns": ["id"],
    "matchRull": "full",
    "updateRule": "cascade",
    "deleteRule": "restrict"
}
```

```js
{
    "type": "CHECK",
    "expr": "(email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')"
}
```
</details>

An index object:

```js
{
    "type": "FULLTEXT",
    "columns": ["full_name"]
}
```

<details>
<summary>More index objects</summary>

```js
{
    "type": "SPATIAL",
    "columns": ["full_name"]
}
```
</details>

</details>

**Now, you may change anything at any time by simply editing your schema in-place!** For example, you'd add a new table by simply extending the tables list; a new column by simply extending the columns list; a new constraint by simply extending the constraints list. You can go on to change the respective objects at their respective property level! For example, may remove a column-level constraint, `uniqueKey` for example, by simply deleting it; or change the column type, or update the `check` constraint, by simply overwriting it.

*Changes are commited to your database at your next [`linkedql migrate`](#cmd-linkedql-migrate).*

**Names may be changed, but not in-place!** A "rename" operation - whether on a database object, a table object, a column object, a constraint object, or an index object - would need to be done by means of an extra property that serves as a complement to the `name` property:

```js
{
    "name": "old_name",
    "$name": "new_name"
}
```

*Your new name is picked up at your next [`linkedql migrate`](#cmd-linkedql-migrate), and the `$name` property automatically disappears.*

**Each `migrate` operation is automatically versioned and you can see that reflected in a `version` property for each database in your schema!** (The `version` property automatically appears for a database after the first `migrate` operation.) Now, you can roll back over a version, or over consecutive versions, at any time. And after rolling back, you can also roll forward; and that can be fun!

*You may want to preview your destination savepoint using [`linkedql savepoints`](#cmd-linkedql-savepoints) before each [`linkedql rollback`](#cmd-linkedql-rollback).*

Interesting yet? You may want to learn more about [Linked QL's unique take on Schema as Code](#) as a paradigm and a practice.

## API

This is a quick overview of the Linked QL API.

### Object: `Client`

This is the top-level object for the individual database kinds in Linked QL. Each instance implements the following interface:

<details>
<summary>
<code>client.query(query: string[, options: object]): Promise&lt;Savepoint | Array&lt;&gt;&gt;</code><br>
Run any SQL query.</summary>

+ `query` is any SQL query; and return value is a `Savepoint` instance for all `CREATE`, `ALTER`, `DROP` operations, then an `Array` of data objects for `SELECT` queries, and for `INSERT`, `UPDATE`, and `DELETE` operations which specify a `RETURNING` clause.

    ```js
    const savepoint = await client.query('ALTER TABLE users RENAME TO accounts');
    console.log(savepoint.versionTag); // Number
    
    await savepoint.rollback(); // true
    ```

    ```js
    const rows = await client.query('SELECT * FROM users WHERE id = 4');
    console.log(rows.length); // 1
    ```

    ```js
    const rows = await client.query('INSERT INTO users SET name = \'John Doe\' RETURNING id');
    console.log(rows.length); // 1
    ```

+ `options` is optional and can be used to specify:

    + `dialect` for specifying the SQL dialect in use: `mysql` or `postgres` (the default). (Details soon as to this is treated by Linked QL.)

        ```js
        // Unlock certain dialect-specific clauses or conventions
        const rows = await client.query('ALTER TABLE users MODIFY COLUMN id int', { dialect: 'mysql' });
        ```
    + `params` for passing in values for any parameters used in the query.

        ```js
        const rows = await client.query('SELECT * FROM users WHERE id = $1', { params: [4] });
        ```
    + `description` for adding meaning to a `CREATE`, `ALTER`, `DROP` operation, as will be seen in the savepoint created.

        ```js
        const savepoint = await client.query('DROP DATABASE test', { description: 'No longer needed' });
        ```
    + `noCreateSavepoint` for preventing the default savepoint creation on `CREATE`, `ALTER`, `DROP` operations.

        ```js
        const savepoint = await client.query('DROP DATABASE test', { noCreateSavepoint: true });
        ```

</details>

<details>
<summary>
<code>client.createDatabase(dbSchema: object[, options: object]): Promise&lt;Savepoint&gt;</code><br>
Dynamically compose a <code>CREATE DATABASE</code> query.</summary>

+ `dbSchema` is a [database schema](#schemajson); and `options` is as described in `query()`. Return value is a `Savepoint` instance.

    ```js
    const savepoint = await client.createDatabase({ name: 'database_1' }, { description: 'Just testing database creation' });
    ```

    Any tables specified, as with a [database schema](#schemajson), are created together.

    ```js
    const savepoint = await client.createDatabase({
        name: 'database_1',
        tables: [{
            name: 'table_1'
            columns: [{ name: 'column_1', type: 'INT' }, { name: 'column_2', type: 'time' }]
        }]
    }, { description: 'Just testing database creation' });
    ```

+ `options` may also be used to pass the flag: `ifNotExists`.

    ```js
    const savepoint = await client.createDatabase({ name: 'database_1' }, { ifNotExists: true, description: 'Just testing database creation' });
    ```

</details>

<details>
<summary>
<code>client.alterDatabase(altRequest: object, callback: (db: DatabaseSchema) => void, [, options: object]): Promise&lt;Savepoint&gt;</code><br>
Dynamically compose an <code>ALTER DATABASE</code> query.</summary>

+ `altRequest` is an object of the following form: `{ name: string, tables?: array }`, where name is the name of the DB object to alter and tables is an optional list of table objects to include in the returned object for the ALTER operation.

+ `callback` is a function that is called with the requested *DatabaseSchema* instance. `options` is, again, as described in `query()`, and return value is a `Savepoint` instance.

    ```js
    const savepoint = await client.alterDatabase({ name: 'database_1' }, db => {
        db.name('database_1_new');
    }, { description: 'Renaming for testing purposes' });
    ```

    Any tables specified in the input request can be accessed and altered.

    ```js
    const savepoint = await client.alterDatabase({ name: 'database_1', tables: ['table_1'] }, db => {
        db.name('database_1_new');
        db.table('table_1').column('column_1').name('column_1_new');
        db.table('table_1').column('column_2').type('varchar');
    }, { description: 'Renaming for testing purposes' });
    ```

</details>

<details>
<summary>
<code>client.dropDatabase(dbName: string, [, options: object]): Promise&lt;Savepoint&gt;</code><br>
Dynamically compose a <code>DROP DATABASE</code> query.</summary>

+ `dbName` is the name of the DB to drop. `options` is, again, as described for `query()`, and return value is a `Savepoint` instance.

    ```js
    const savepoint = await client.dropDatabase('database_1', { description: 'Droping for testing purposes' });
    ```

    
+ `options` may also be used to pass the flags: `ifExists`, `cascade`.

    ```js
    const savepoint = await client.createDatabase('database_1', { ifExists: true, cascade: true, description: 'Droping for testing purposes' });
    ```

</details>

## TODO

There's a lot here:

+ Write detailed docs.
+ Upgrade support for MySQL.
+ Implement support for IndexedDB and in-mem.
+ Write detailed tests.

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
