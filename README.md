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

Other APIs are covered just ahead in the [API](#the-client-api) section.

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

```sql
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

Meet Linked QL's special extension to your database that does exaclty that and lets you just alter your DB however you may but in a safety net! Meet Automatic Schema Savepoints and Rollbacks!

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

<details><summary>Show console</summary>

>
> | Key               | Value                    |
> | :---------------- | :------                  |
> | description       | Create users table       |
> | version_tag       | 1                        |
> | savepoint_date    | 2024-07-17T22:40:56.786Z |
> | *+6 more rows...* |                          |

</details>

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

With schema versioning now having been moved to the a database, the rest of the database story at the application level should now be revisited. Linked QL takes it further here to streamline your application's database footprint from spanning hundreds of migration files to fitting into a single `schema.json` file!

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

**Now, you may simply edit any part of your schema in-place!** For example, you can add a new table by simply extending the tables list; a new column by simply extending the columns list; a new constraint by simply extending the constraints list. You can go on to change the respective objects at their respective property level! For example, you may remove a column-level constraint, say `uniqueKey`, by simply deleting it; or change the column type, or update the `check` constraint, by simply overwriting it.

*Changes are commited to your database at your next [`linkedql migrate`](#cmd-linkedql-migrate).*

**Names may be changed, but not in-place!** A "rename" operation - whether on a database object, a table object, a column object, a constraint object, or an index object - would need to be done via a new `$name` property:

```js
{
    "name": "old_name",
    "$name": "new_name"
}
```

*Your new name is picked up at your next [`linkedql migrate`](#cmd-linkedql-migrate), and the `$name` property automatically disappears.*

**Each `migrate` operation is automatically versioned and you can see that reflected in a `version` property for each database in your schema!** (The `version` property automatically appears for a database after the first `migrate` operation.) Now, you can roll back over a version, or over consecutive versions, at any time. And after rolling back, you can also roll forward!

*You may use [`linkedql savepoints`](#cmd-linkedql-savepoints) to preview the next savepoint at each database before each [`linkedql rollback`](#cmd-linkedql-rollback).*

Interesting yet? You may want to learn more about [Linked QL's unique take on Schema as Code](#) as a paradigm and a practice.

## API

This is a quick overview of the Linked QL API.

Here we talk about the `client.query()` method in detail along with other Linked QL APIs that essentially let us do the same things as with `client.query()`, but this time, programmatically.

For example, a `CREATE DATABASE` query...

```js
const savepoint = await client.query('CREATE DATABASE IF NOT EXISTS database_1');
```

could also be programmatically done as:

```js
const savepoint = await client.createDatabase('database_1', { ifNotExists: true });
```

That said, while the `createDatabase()` method is associated with the base `Client` object, the different programmatic query APIs in Linked QL are actually organized into three hierarchical scopes:

+ the top-level scope (represented by the [`Client`](#the-client-api) interface), featuring methods such as:

    + [`createDatabase()`](#clientcreatedatabase)
    + [`alterDatabase()`](#clientalterdatabase)
    + [`dropDatabase()`](#clientdropdatabase)
    + [`hasDatabase()`](#clienthasdatabase)
    + [`describeDatabase()`](#clientdescribedatabase)

+ the database-level scope (represented by a certain [`Database`](#the-database-api) interface), featuring methods such as:

    + [`createTable()`](#databasecreatetable)
    + [`alterTable()`](#databasealtertable)
    + [`dropTable()`](#databasedroptable)
    + [`hasTable()`](#databasehastable)
    + [`describeTable()`](#databasedescribetable)

+ the table-level scope (represented by a certain [`Table`](#the-table-api) interface), featuring methods such as:

    + [`select()`](#tableselect)
    + `insert()`
    + `upsert()`
    + `update()`
    + `delete()`

And it's easy to narrow down from the top-level scope to a database...

```js
const database_1 = client.database('database_1');
```

and from there to a table:

```js
const table_1 = database.table('table_1');
```

These APIs at play would look something like:

```js
// Create database "database_1"
await client.createDatabase('database_1', { ifNotExists: true });
```

```js
// Enter "database_1" and create a table
await client.database('database_1').createTable({
    name: 'table_1', columns: [
        { name: 'column_1', type: 'int', identity: true, primaryKey: true },
        { name: 'column_2', type: 'varchar' },
        { name: 'column_3', type: 'varchar' },
    ]
});
```

```js
// Enter "table_1" and insert data
await client.database('database_1').table('table_1').insert({
    column_2: 'Column 2 test content',
    column_3: 'Column 3 test content',
});
```

These APIs and more are what's covered in this section.

Click on each method definition for details.

------------

### The `Client` API

*Client* is the top-level object for the individual database kinds in Linked QL. Each instance implements the following interface:

+ [`client.query()`](#clientquery)
+ [`client.createDatabase()`](#clientcreatedatabase)
+ [`client.alterDatabase()`](#clientalterdatabase)
+ [`client.dropDatabase()`](#clientdropdatabase)
+ [`client.hasDatabase()`](#clienthasdatabase)
+ [`client.describeDatabase()`](#clientdescribedatabase)
+ [`client.databases()`](#clientdatabases)
+ [`client.database()`](#clientdatabase)

#### `client.query()`:

<details><summary>
Run any SQL query.
<pre><code>client.query(sql: string, options?: Options): Promise&lt;Savepoint | Array&lt;object&gt;&gt;</code></pre></summary>

*└ Spec:*
+ `sql` (string): an SQL string.
+ `options` (Options, *optional*): extra parameters for the query.
+ Return value: a [`Savepoint`](#the-savepoint-api) instance when it's a `CREATE`, `ALTER`, or `DROP` query, but an array (the result set) when it's a `SELECT` query or an `INSERT`, `UPDATE`, or `DELETE` query that have a `RETURNING` clause.

Run a `CREATE`, `ALTER`, or `DROP` query and get back a savepoint:

```js
const savepoint = await client.query('ALTER TABLE users RENAME TO accounts');
console.log(savepoint.versionTag); // number

await savepoint.rollback(); // true
```

or a SELECT query, and get back a result set:

```js
const rows = await client.query('SELECT * FROM users WHERE id = 4');
console.log(rows.length); // 1
```

or an `INSERT`, `UPDATE`, or `DELETE` query with a `RETURNING` clause, and ge backt a result set:

```js
const rows = await client.query('INSERT INTO users SET name = \'John Doe\' RETURNING id');
console.log(rows.length); // 1
```

Use `options` for some additional parameters:

+ `dialect` (string, *optional*): the SQL dialect in use: `postgres` (the default) or `mysql`. (Details soon as to how this is treated by Linked QL.)

    ```js
    // Unlock certain dialect-specific clauses or conventions
    const rows = await client.query('ALTER TABLE users MODIFY COLUMN id int', { dialect: 'mysql' });
    ```
+ `params` ((string | number)[], *optional*): the values for parameter-binding in the query.

    ```js
    const rows = await client.query('SELECT * FROM users WHERE id = $1', { params: [4] });
    ```
+ `description` (string, *optional*): the description for a `CREATE`, `ALTER`, `DROP` query and for the underlying savepoint they create.

    ```js
    const savepoint = await client.query('DROP DATABASE test', { description: 'No longer needed' });
    ```
+ `noCreateSavepoint` (boolean, *optional*): a flag to prevent creating a savepoint on a `CREATE`, `ALTER`, `DROP` query.

    ```js
    await client.query('DROP DATABASE test', { noCreateSavepoint: true });
    ```

</details>

#### `client.createDatabase()`:

<details><summary>
Dynamically run a <code>CREATE DATABASE</code> query.
<pre><code>client.createDatabase(createSpec: string | { name: string, tables?: Array }, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*
+ `createSpec` (string | { name: string, tables?: Array }): the database name, or an object corresponding to the [database JSON schema](#schemajson).
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

Specify database by name:

```js
const savepoint = await client.createDatabase('database_1', { description: 'Just testing database creation' });
```

or by a schema object, with an optional list of tables to be created along with it, with each listed table corresponding to the [table JSON schema](#schemajson):

```js
const savepoint = await client.createDatabase({
    name: 'database_1',
    tables: [{
        name: 'table_1'
        columns: [{ name: 'column_1', type: 'INT' }, { name: 'column_2', type: 'time' }]
    }]
}, { description: 'Just testing database creation' });
```

Use `options` for some additional parameters:

+ `ifNotExists` (boolean, *optional*): a flag to conditionally create the database.

    ```js
    const savepoint = await client.createDatabase('database_1', { ifNotExists: true, description: 'Just testing database creation' });
    ```

</details>

#### `client.alterDatabase()`:

<details><summary>
Dynamically run an <code>ALTER DATABASE</code> query.
<pre><code>client.alterDatabase(alterSpec: string | { name: string, tables?: string[] }, callback: (schema: DatabaseSchema) => void, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*
+ `alterSpec` (string | { name: string, tables?: string[] }): the database name, or an object with an optional list of tables to be altered along with it.
+ `callback` ((schema: DatabaseSchema) => void): a function that is called with the requested schema. This can be async. Received object is a [`DatabaseSchema`](#the-database-apischema) instance.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

Specify database by name:

```js
const savepoint = await client.alterDatabase('database_1', schema => {
    schema.name('database_1_new');
}, { description: 'Renaming for testing purposes' });
```

or by an object, with an optional list of tables to be altered along with it:

```js
const savepoint = await client.alterDatabase({ name: 'database_1', tables: ['table_1'] }, schema => {
    schema.name('database_1_new');
    schema.table('table_1').column('column_1').name('column_1_new');
    schema.table('table_1').column('column_2').type('varchar');
}, { description: 'Renaming for testing purposes' });
```

</details>

#### `client.dropDatabase()`:

<details><summary>
Dynamically run a <code>DROP DATABASE</code> query.
<pre><code>client.dropDatabase(dbName: string, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*
+ `dbName` (string): the database name.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

```js
const savepoint = await client.dropDatabase('database_1', { description: 'Dropping for testing purposes' });
```

Use `options` for some additional parameters:

+ `ifExists` (boolean, *optional*): a flag to conditionally drop the database.

    ```js
    const savepoint = await client.dropDatabase('database_1', { ifExists: true, description: 'Dropping for testing purposes' });
    ```

+ `cascade` (boolean, *optional*): a flag to force-drop the database along with its dependents.

    ```js
    const savepoint = await client.dropDatabase('database_1', { cascade: true, description: 'Dropping for testing purposes' });
    ```

</details>

#### `client.hasDatabase()`:

<details><summary>
Check if a database exists.
<pre><code>client.hasDatabase(dbName: string): Promise&lt;Boolean&gt;</code></pre></summary>

*└ Spec:*
+ `dbName` (string): the database name.
+ Return value: Boolean.

```js
const exists = await client.hasDatabase('database_1');
```

</details>

#### `client.describeDatabase()`:

<details><summary>
Get the schema structure for a database.
<pre><code>client.describeDatabase(dbName: string): Promise&lt;{ name: string, tables: Array }&gt;</code></pre></summary>

*└ Spec:*
+ `dbName` (string): the database name.
+ Return value: an object corresponding to the [database JSON schema](#schemajson).

```js
const schema = await client.describeDatabase('database_1');
console.log(schema.name);
console.log(schema.tables);
```

</details>

#### `client.databases()`:

<details><summary>
Get a list of available databases.
<pre><code>client.databases(): Promise&lt;Array&lt;string&gt;&gt;</code></pre></summary>

*└ Spec:*
+ Return value: an array of database names.

```js
const databases = await client.databases();
console.log(databases); // ['public', 'database_1', ...]
```

</details>

#### `client.database()`:

<details><summary>
Obtain a <code>Database</code> instance.
<pre><code>client.database(dbName: string): Database</code></pre></summary>

*└ Spec:*
+ `dbName` (string): the database name.
+ Return value: a [`Database`](#the-database-api) instance.

```js
const database = client.database('database_1');
```

</details>

------------

### The `Database` API

*Database* is the API for database-level operations. This object is obtained via [`client.database()`](#clientdatabase)

+ [`database.createTable()`](#databasecreatetable)
+ [`database.alterTable()`](#databasealtertable)
+ [`database.dropTable()`](#databasedroptable)
+ [`database.hasTable()`](#databasehastable)
+ [`database.describeTable()`](#databasedescribetable)
+ [`database.tables()`](#databasetables)
+ [`database.table()`](#databasetable)
+ [`database.savepoint()`](#databasesavepoint)

#### `database.createTable()`:

<details><summary>
Dynamically run a <code>CREATE TABLE</code> query.
<pre><code>database.createTable(createSpec: { name: string, columns: Array, constraints?: Array, indexes?: Array }, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*
+ `createSpec` ({ name: string, columns: Array, constraints?: Array, indexes?: Array }): an object corresponding to the [table JSON schema](#schemajson).
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

```js
const savepoint = await database.createTable({
    name: 'table_1'
    columns: [
        { name: 'column_1', type: 'INT' }, 
        { name: 'column_2', type: 'time' }
    ]
}, { description: 'Just testing table creation' });
```

Use `options` for some additional parameters:

+ `ifNotExists` (boolean, *optional*): a flag to conditionally create the table.

    ```js
    const savepoint = await database.createTable({
        name: 'table_1'
        columns: [ ... ]
    }, { ifNotExists: true, description: 'Just testing table creation' });
    ```

</details>

#### `database.alterTable()`:

<details><summary>
Dynamically run an <code>ALTER TABLE</code> query.
<pre><code>database.alterTable(tblName: string, callback: (schema: TableSchema) => void, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*
+ `tblName` (string): the table name.
+ `callback` ((schema: TableSchema) => void): a function that is called with the requested table schema. This can be async. Received object is a [`TableSchema`](#the-table-apischema) instance.
+ `options`  (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

```js
const savepoint = await database.alterTable('table_1', schema => {
    schema.name('table_1_new');
    schema.column('column_1').type('int');
    schema.column('column_2').drop();
}, { description: 'Renaming for testing purposes' });
```

</details>

#### `database.dropTable()`:

<details><summary>
Dynamically run a <code>DROP TABLE</code> query.
<pre><code>database.dropTable(tblName: string, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*
+ `tblName` (string): the table name.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

```js
const savepoint = await database.dropTable('table_1', { description: 'Dropping for testing purposes' });
```

Use `options` for some additional parameters:

+ `ifExists` (boolean, *optional*): a flag to conditionally drop the table.

    ```js
    const savepoint = await database.dropTable('table_1', { ifExists: true, description: 'Dropping for testing purposes' });
    ```

+ `cascade` (boolean, *optional*): a flag to force-drop the table along with its dependents.

    ```js
    const savepoint = await database.dropTable('table_1', { cascade: true, description: 'Dropping for testing purposes' });
    ```

</details>

#### `database.hasTable()`:

<details><summary>
Check if a table exists.
<pre><code>database.hasTable(tblName: string): Promise&lt;Boolean&gt;</code></pre></summary>

*└ Spec:*
+ `tblName` (string): the table name.
+ Return value: Boolean.

```js
const exists = await database.hasTable('database_1');
```

</details>

#### `database.describeTable()`:

<details><summary>
Get the schema structure for a table.
<pre><code>database.describeTable(tblName: string): Promise&lt;{ name: string, columns: Array, constraints: Array, indexes: Array }&gt;</code></pre></summary>

*└ Spec:*
+ `tblName` (string): the table name.
+ Return value: an object corresponding to the [Table JSON schema](#schemajson).

```js
const schema = await database.describeTable('table_1');
console.log(schema.name);
console.log(schema.columns);
```

</details>

#### `database.tables()`:

<details><summary>
Get a list of available tables.
<pre><code>database.tables(): Promise&lt;Array&lt;string&gt;&gt;</code></pre></summary>

*└ Spec:*
+ Return value: an array of table names.

```js
const tables = await database.tables();
console.log(tables); // ['table_1', 'table_2', ...]
```

</details>

#### `database.table()`:

<details><summary>
Obtain a <code>Table</code> instance.
<pre><code>database.table(tblName: string): Table</code></pre></summary>

*└ Spec:*
+ `tblName` (string): the table name.
+ Return value: a [`Table`](#the-table-api) instance.

```js
const table = database.table('table_1');
```

</details>

#### `database.savepoint()`:

<details><summary>
Obtain the next available <i>savepoint</i> for given database.
<pre><code>database.savepoint(options?: { direction: string }): Savepoint</code></pre></summary>

*└ Spec:*
+ `options` ({ direction: string }, *optional*): extra paramters for the method.
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

```js
const savepoint = await database.savepoint();
console.log(savepoint.versionTag); // Number

await savepoint.rollback(); // true
```

Use `options` for some additional parameters:

+ `direction` (string, *optional*): the direction in which to go - either back in time: `backward` (the default), or forward in time: `forward`.

    ```js
    const savepoint = await database.savepoint({ direction: 'forward' });
    console.log(savepoint.versionTag); // number

    await savepoint.rollback(); // true
    ```

</details>

------------

### The `Table` API

*Table* is the API for table-level operations. This object is obtained via [`database.table()`](#databasetable)

+ [`table.count()`]()

#### `table.count()`:

<details><summary>
Count total entries in table.
<pre><code>table.count(expr?: string | Function = *): number</code></pre></summary>

*└ Spec:*
+ `expr` (string | Function = *, *optional*): a string denoting column name, or a function that recieves a *Field* object with which to build an expression. Defaults to `*`.
+ Return value: number.

```js
const rowCount = await table.count();
```

```js
// Number of rows where column_1 isn't null
const rowCount = await table.count('column_1');
```

</details>

#### `table.select()`:

<details><summary>
Dynamically run a <code>SELECT</code> query.
<pre><code>table.select(fields?: (string | Function)[] = *, where?: number | object | Function): Promise&lt;Array&lt;object&gt;&gt;</code></pre>
<pre><code>table.select(where?: number | object | Function): Promise&lt;Array&lt;object&gt;&gt;</code></pre></summary>

*└ Spec:*
+ `fields` ((string | Function)[] = *, *optional*): a array of fields to select. (A field being either a string denoting column name, or a function that recieves a *Field* object with which to build an expression.)
+ `where` (number | object | Function, *optional*): a number denoting primary key value of the target row, or an object denoting column name/column value conditions, or a function that recieves an *Assertion* object with which to build the conditions.

```js
// Select all fields (*) from all records
const result = await table.select();
```

```js
// Select specified fields from the record with primary key value of 4
const result = await table.select(['first_name', 'last_name', 'email'], 4);
```

```js
// Select record by primary key value, ommiting fields
const result = await table.select(4);
```

```js
// Select record by some column name/column value conditions, ommiting fields
const result = await table.select({ first_name: 'John', last_name: 'Doe' });
```

</details>

#### `table.insert()`:

<details><summary>
Dynamically run an <code>INSERT</code> query.
<pre><code>table.insert(payload: object | object[], returnList?: (string | Function)[]): Promise&lt;Savepoint&gt;</code></pre>
<pre><code>table.insert(columns: string[], values: any[][], returnList?: (string | Function)[]): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*
+ `payload` (object | object[]): an object denoting a single entry, or an array of said objects denoting multiple entries. (An entry having the general form: `{ [key: string]: string | number | any[] | object | Date | null | boolean; }` where arrays and objects as values are acceptable only for JSON columns.)
+ `columns` (string[]): just column names (as against the key/value-based `payload` in the first call pattern).
+ `values` (any[][]): a two-dimensional array of just values (as against the key/value-based `payload` in the first call pattern), denoting multiple entries. 
+ `returnList` ((string | Function)[], *optional*): a list of fields, corresponding to a [select list](#tableselect), specifying data to be returned from the just inserted row. (Equivalent to Postgres' [RETURNING clause](https://www.postgresql.org/docs/current/dml-returning.html), but supported for other DB kinds in Linked QL.)

```js
// Insert single entry
await table.insert({ first_name: 'John', last_name: 'Doe', email: 'johndoe@example.com'});
```

```js
// Insert multiple entries
await table.insert([
    { first_name: 'John', last_name: 'Doe', email: 'johndoe@example.com'},
    { first_name: 'James', last_name: 'Clerk', email: 'jamesclerk@example.com'},
]);
```

```js
// Insert multiple entries another way
await table.insert(['first_name', 'last_name', 'email'], [
    ['John', 'Doe', 'johndoe@example.com'],
    ['James', 'Clerk', 'jamesclerk@example.com'],
]);
```

```js
// Insert single entry with a return list
const returnList = await table.insert({ first_name: 'John', last_name: 'Doe', email: 'johndoe@example.com'}, ['id']);
```

</details>

#### `table.upsert()`:

<details><summary>
Dynamically run an <code>UPSERT</code> query.
<pre><code>table.insert(payload: object | object[], returnList?: (string | Function)[]): Promise&lt;Savepoint&gt;</code></pre>
<pre><code>table.insert(columns: string[], values: any[][], returnList?: (string | Function)[]): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:* (Same as [`insert()`](#tableinsert).)

*└ Usage:* An `UPSERT` operation is an `INSERT` that automatically converts to an `UPDATE` where given record already exists. Usage is same as [`insert()`](#tableinsert).

</details>

------------

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
