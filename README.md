# Linked QL

[![npm version][npm-version-src]][npm-version-href]<!--[![npm downloads][npm-downloads-src]][npm-downloads-href]-->
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

❄️ **_Save the overhead working with SQL and structured data - from the time and effort spent figuring out relational queries to the labour managing schemas!_** Try a modern, minimalistic take on SQL and databases in general!

Linked QL is a DB query client that simplfies how you interact with your database and manage your schemas.

💥 Takes the ORM and friends out of the way and let's you just write SQL, but SQL that you will actually enjoy. (Linked QL extends standard SQL with [new syntax sugars](#introducing-magic-paths) that let you write relational queries in 50% less code and without a single JOIN clause.)

⚡️ Takes the process out of schema management and lets you just *ALTER* away your DB, but in a safety net. (Linked QL extends your DB behind the scenes to [automatically version](#introducing-auto-versioning) each edit you make and have them kept as "savepoints" that you can always rollback to.)

💥 Brings the "schema-as-code" paradigm to its true meaning and essentially lets you have your entire DB structure go in a single [`schema.json` file](#re-introducing-schema-as-code-with-schemajson) that you edit in-place, as against the "hundreds of migration files" story. (Linked QL essentially rewrites that story.)

It comes as a small library and is usable over your DB of choice - from the server-side Postgres and MySQL, to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), to the plain JSON object!

Jump to sections and features:

+ [Basic Usage](#basic-usage)
+ [Magic Paths](#introducing-magic-paths)
+ [Auto-Versioning](#introducing-auto-versioning)
+ [Schema-as-Code](#re-introducing-schema-as-code-with-schemajson)
+ [API](#linked-ql-api)

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

Other APIs are covered just ahead in the [API](#linked-ql-api) section.

## Introducing Magic Paths

💥 *Express relationships graphically.*

JOINS can be good, but can be a curse too, as they almost always obfuscate your whole query! But what if you didn't have to write JOINS to express certain relationships?

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

✨ PRO: *About 50% code and whole namespacing exercise are now eliminated; all with zero upfront setup!*

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

Databases have historically lacked the concept of schema versioning, and that has seen all the engineering work pushed down to the client applications. If you've ever had to adopt a special process for defining and managing your schemas, wherein changes are handled through *serially-named* files within your application, each written as an `UP`/`DOWN` pair of actions, and overall supported by tooling...

```sql
app
  ├─ migrations
  │ │
  │ ├─ 20240523_1759_create_users_table_and_drop_accounts_table
  │ │ │
  │ │ ├─ up.sql
  │ │ │    CREATE TABLE users (id INT, first_n...);
  │ │ │    DROP TABLE accounts;
  │ │ └─ down.sql
  │ │      DROP TABLE users;
  │ │      CREATE TABLE accounts (id INT, first_name VAR...);
  │ │
  │ ├─ 20240523_1760_add_last_login_to_users_table_and_rename_order_status_table
  │ │ │
  │ │ ├─ up.sql
  │ │ │    ALTER TABLE users ADD COLUMN last_lo...;
  │ │ │    ALTER TABLE order_status RENAME TO o...;
  │ │ └─ down.sql
  │ │      ALTER TABLE users DROP COLUMN last_login;
  │ │      ALTER TABLE order_tracking RENAME TO order_status;
  │ │
  │ ├─ +256 more...
```

then you've faced the problem that this defeciency in databases creates! But what if databases magically got to do the heavy lifting?

Meet Linked QL's special extension to your database that does exactly that and lets you just alter your DB however you may but in the safety net of some behind-the-scenes snapshots of your schema before each alteration! Meet Automatic Schema Savepoints and Rollbacks!

Linked QL:

```js
// Alter schema
const savepoint = await client.query('CREATE TABLE public.users (id int, name varchar)', {
    description: 'Create users table',
});
```

```js
// Inspect the automatic savepoint created for you
console.table(savepoint.description);   // Create users table
console.table(savepoint.versionTag);    // 1
console.table(savepoint.savepointDate); // 2024-07-17T22:40:56.786Z
```

*(More details in the [Savepoint API](#the-savepoint-api).)*

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

and it turns out you can "undo" a rollback, or in other words, roll forward to a point in time:

```js
// "Undo" the last rollback (Gets the users table re-created)
let savepoint = await client.database('public').savepoint({ direction: 'forward' });
await savepoint.rollback();
```

## Re-Introducing Schema-as-Code with `schema.json`

💥 *Have your entire DB structure live in a single `schema.json` file that you edit in-place!*

With schema versioning now over to the database, much of the related database concerns at the application level should now be irrelevant. It turns out that we could essentially streamline our application-level database footprint from spanning hundreds of migration files to fitting into a single `schema.json` (or `schema.yml`) file!

### └ `schema.json`

```js
[
    {
        "name": "database_1",
        "tables": [] // Table objects
    },
    {
        "name": "database_2",
        "tables": [] // Table objects
    }
]
```

<details><summary>Details</summary>

An example table object:

```js
{
    "name": "users",
    "columns": [], // Column objects (minimum of 1)
    "constraints": [], // Constraint objects
    "indexes": [] // Index objects
}
```

An example column object:

```js
{
    "name": "id",
    "type": "int",
    "primaryKey": true,
    "identity": true
}
```

<details>
<summary>More column examples</summary>

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
        "targetTable": "users",
        "targetColumns": ["id"],
        "matchRull": "full",
        "updateRule": "cascade",
        "deleteRule": "restrict"
    }
}
```
</details>

An example constraint object:

```js
{
    "type": "PRIMARY_KEY",
    "columns": ["id"],
    "name": "constraint_name"
}
```

<details>
<summary>More constraint examples</summary>

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

An example index object:

```js
{
    "type": "FULLTEXT",
    "columns": ["full_name"]
}
```

<details>
<summary>More index examples</summary>

```js
{
    "type": "SPATIAL",
    "columns": ["full_name"]
}
```
</details>

</details>

*(Full spec in the [Linked QL Schemas](#linked-ql-schemas) section.)*

Now, if you had that somewhere in your application, say at `./database/schema.js`, Linked QL could help keep it in sync both ways with your database:

+ you add or remove a database or table or column... and it is automatically reflected in your DB structure with one command: `linkedql migrate`
+ your colleague makes new changes from their codebase... and it is automatically reflected in your local copy with one command: `linkedql reflect`

You also get to see a version indicator on each database object in your schema essentially incrementing on each migrate operation (whether by you or colleague), and decrementing on each rollback operation (whether by you or colleague).

Thanks to a DB-native schema version control system, no need to maintain past states, or risk losing them, as the DB now becomes the absolute source of truth for both itself and its client applications, as against the other way around. (You may want to see how that brings us to [true "Schema as Code" in practice](#test-heading).)

To setup:

1. Make a directory within your application for database concerns. Linked QL will look in `./database`, but you will be able to point to your preferred location when running Linked QL commands.

2. Have a `driver.js` file in there that exports as *default* a function that returns a Linked QL instance. This will be imported and used by Linked QL to interact with your database. This could look something like:

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

3. Have your schemas defined in a `schema.json` file in the same location. (See [`schema.js`](#-schemajson) above for a guide.)

To run:

+ Use `lnkd migrate` to walk through your local schema changes and interactively perform a commit to your database.
+ Use `lnkd rollback` to walk through the latest savepoint at each database and interactively perform a rollback.
+ Use `lnkd leaderboard` to just view the latest savepoint at each database.
+ Use the flag `--desc` in conjunction with `lnkd migrate` to add a description to the new savepoint created by the migration.
+ Use the flag `--direction` in conjunction with `lnkd rollback` and `lnkd leaderboard` to specify either a "back in time" movement (the default) or "forward in time" movement.
+ Use the flag `--db` to scope given command to a specific database out of the list of databases.
+ Use the flag `--dir` to point Linked QL to your "database" directory. (Relative paths will resolve against your current working directory (CWD).)
+ Use the flag `--force` to turn of interactive mode and just run given command in "sensible-default" mode.

*(More details in the [Linked QL CLI](#linked-ql-cli) section.)*


<!--





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

-->

## Linked QL API

Here's for a quick overview of the Linked QL API:

Here we talk about the `client.query()` method in more detail along with other Linked QL APIs that essentially let us do the same things possible with `client.query()`, but this time, programmatically.

We mean, a `CREATE DATABASE` operation...

```js
const savepoint = await client.query('CREATE DATABASE IF NOT EXISTS database_1');
```

could also be programmatically achieved as:

```js
const savepoint = await client.createDatabase('database_1', { ifNotExists: true });
```

That said, while the `createDatabase()` method is associated with the base `Client` object, the different programmatic query APIs in Linked QL are actually organized into three hierarchical scopes:

+ the top-level scope (represented by the [`Client`](#the-client-api) interface), featuring methods such as: `createDatabase()`, `alterDatabase()`, `dropDatabase()`, `hasDatabase()`, `describeDatabase()`

+ the database-level scope (represented by a certain [`Database`](#the-database-api) interface), featuring methods such as: `createTable()`, `alterTable()`, `dropTable()`, `hasTable()`, `describeTable()`

+ the table-level scope (represented by a certain [`Table`](#the-table-api) interface), featuring methods such as: `select()`, `insert()`, `upsert()`, `update()`, `delete()`

And it's easy to narrow down from the top-level scope to a database scope...

```js
const database_1 = client.database('database_1');
```

and from there to a table scope:

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

Click on a definition to expand.

------------

### The `Client` API

*Client* is the top-level object for the individual database kinds in Linked QL. Each instance implements the following interface:

<details><summary>See content</summary>

+ [`client.query()`](#clientquery)
+ [`client.createDatabase()`](#clientcreatedatabase)
+ [`client.alterDatabase()`](#clientalterdatabase)
+ [`client.dropDatabase()`](#clientdropdatabase)
+ [`client.hasDatabase()`](#clienthasdatabase)
+ [`client.describeDatabase()`](#clientdescribedatabase)
+ [`client.databases()`](#clientdatabases)
+ [`client.database()`](#clientdatabase)

</details>

#### `client.query()`:

<details><summary>
Run any SQL query.
<pre><code>client.query(sql: string, options?: Options): Promise&lt;Savepoint | Array&lt;object&gt;&gt;</code></pre></summary>

*└ Spec:*

+ `sql` (string): an SQL query.
+ `options` (Options, *optional*): extra parameters for the query.
+ Return value: a [`Savepoint`](#the-savepoint-api) instance when it's a `CREATE`, `ALTER`, or `DROP` operation, but an array (the result set) when it's a `SELECT` query or when it's an `INSERT`, `UPDATE`, or `DELETE` operation that has a `RETURNING` clause.

##### ✨ Usage:

Run a `CREATE`, `ALTER`, or `DROP` operation and get back a reference to the savepoint associated with it:

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

or an `INSERT`, `UPDATE`, or `DELETE` operation with a `RETURNING` clause, and ge backt a result set:

```js
const rows = await client.query('INSERT INTO users SET name = \'John Doe\' RETURNING id');
console.log(rows.length); // 1
```

Some additional parameters via `options`:

+ `dialect` (string, *optional*): the SQL dialect in use: `postgres` (the default) or `mysql`. (Details soon as to how this is treated by Linked QL.)

    ```js
    // Unlock certain dialect-specific clauses or conventions
    const rows = await client.query('ALTER TABLE users MODIFY COLUMN id int', { dialect: 'mysql' });
    ```
+ `params` ((string | number | boolean | null | Date | object | any[])[], *optional*): the values for parameter-binding in the query.

    ```js
    const rows = await client.query('SELECT * FROM users WHERE id = $1', { params: [4] });
    ```
+ `description` (string, *optional*): the description for a `CREATE`, `ALTER`, `DROP` operation and for the underlying savepoint they create.

    ```js
    const savepoint = await client.query('DROP DATABASE test', { description: 'No longer needed' });
    ```
+ `noCreateSavepoint` (boolean, *optional*): a flag to disable savepoint creation on a `CREATE`, `ALTER`, `DROP` operation.

    ```js
    await client.query('DROP DATABASE test', { noCreateSavepoint: true });
    ```

</details>

#### `client.createDatabase()`:

<details><summary>
Dynamically run a <code>CREATE DATABASE</code> operation.
<pre><code>client.createDatabase(createSpec: string | { name: string, tables?: Array }, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*

+ `createSpec` (string | { name: string, tables?: Array }): the database name, or an object corresponding to the [database JSON schema](#schemajson).
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

##### ✨ Usage:

Specify database by name:

```js
const savepoint = await client.createDatabase('database_1', { description: 'Just testing database creation' });
```

or by a schema object, with an optional list of tables to be created along with it. (Each listed table corresponding to the [table JSON schema](#schemajson).):

```js
const savepoint = await client.createDatabase({
    name: 'database_1',
    tables: [{
        name: 'table_1'
        columns: [{ name: 'column_1', type: 'int' }, { name: 'column_2', type: 'time' }]
    }]
}, { description: 'Just testing database creation' });
```

Some additional parameters via `options`:

+ `ifNotExists` (boolean, *optional*): a flag to conditionally create the database.

    ```js
    const savepoint = await client.createDatabase('database_1', { ifNotExists: true, description: 'Just testing database creation' });
    ```

</details>

#### `client.alterDatabase()`:

<details><summary>
Dynamically run an <code>ALTER DATABASE</code> operation.
<pre><code>client.alterDatabase(alterSpec: string | { name: string, tables?: string[] }, callback: (schema: DatabaseSchema) => void, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*

+ `alterSpec` (string | { name: string, tables?: string[] }): the database name, or an object with the name and, optionally, a list of tables to be altered along with it.
+ `callback` ((schema: DatabaseSchema) => void): a function that is called with the requested schema. This can be async. Received object is a [`DatabaseSchema`](#the-database-apischema) instance.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

##### ✨ Usage:

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
Dynamically run a <code>DROP DATABASE</code> operation.
<pre><code>client.dropDatabase(dbName: string, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*

+ `dbName` (string): the database name.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

##### ✨ Usage:

```js
const savepoint = await client.dropDatabase('database_1', { description: 'Dropping for testing purposes' });
```

Some additional parameters via `options`:

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

##### ✨ Usage:

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

##### ✨ Usage:

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

##### ✨ Usage:

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

##### ✨ Usage:

```js
const database = client.database('database_1');
```

</details>

------------

### The `Database` API

*Database* is the API for database-level operations. This object is obtained via [`client.database()`](#clientdatabase)

<details><summary>See content</summary>

+ [`database.name`](#databasename)
+ [`database.createTable()`](#databasecreatetable)
+ [`database.alterTable()`](#databasealtertable)
+ [`database.dropTable()`](#databasedroptable)
+ [`database.hasTable()`](#databasehastable)
+ [`database.describeTable()`](#databasedescribetable)
+ [`database.tables()`](#databasetables)
+ [`database.table()`](#databasetable)
+ [`database.savepoint()`](#databasesavepoint)

</details>

#### `database.name`:

<details><summary>
The name associated with the <i>Database</i> instance.
<pre><code>database.name: (string, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const database = client.database('test_db');
console.log(database.name); // test_db
```

</details>

#### `database.createTable()`:

<details><summary>
Dynamically run a <code>CREATE TABLE</code> operation.
<pre><code>database.createTable(createSpec: { name: string, columns: Array, constraints?: Array, indexes?: Array }, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*

+ `createSpec` ({ name: string, columns: Array, constraints?: Array, indexes?: Array }): an object corresponding to the [table JSON schema](#schemajson).
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

##### ✨ Usage:

```js
const savepoint = await database.createTable({
    name: 'table_1'
    columns: [
        { name: 'column_1', type: 'int' }, 
        { name: 'column_2', type: 'time' }
    ]
}, { description: 'Just testing table creation' });
```

Some additional parameters via `options`:

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
Dynamically run an <code>ALTER TABLE</code> operation.
<pre><code>database.alterTable(tblName: string, callback: (schema: TableSchema) => void, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*

+ `tblName` (string): the table name.
+ `callback` ((schema: TableSchema) => void): a function that is called with the requested table schema. This can be async. Received object is a [`TableSchema`](#the-table-apischema) instance.
+ `options`  (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

##### ✨ Usage:

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
Dynamically run a <code>DROP TABLE</code> operation.
<pre><code>database.dropTable(tblName: string, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

*└ Spec:*

+ `tblName` (string): the table name.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

##### ✨ Usage:

```js
const savepoint = await database.dropTable('table_1', { description: 'Dropping for testing purposes' });
```

Some additional parameters via `options`:

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

##### ✨ Usage:

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

##### ✨ Usage:

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

##### ✨ Usage:

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

##### ✨ Usage:

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

##### ✨ Usage:

```js
const savepoint = await database.savepoint();
console.log(savepoint.versionTag); // number

await savepoint.rollback(); // true
```

Some additional parameters via `options`:

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

<details><summary>See content</summary>

+ [`table.name`](#tablename)
+ [`table.count()`](#tablecount)
+ [`table.select()`](#tableselect)
+ [`table.insert()`](#tableinsert)
+ [`table.upsert()`](#tableupsert)
+ [`table.update()`](#tableupdate)
+ [`table.delete()`](#tabledelete)

</details>

#### `table.name`:

<details><summary>
The name associated with the <i>Table</i> instance.
<pre><code>table.name: (string, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const table = client.database('test_db').table('table_1');
console.log(table.name); // table_1
```

</details>

#### `table.count()`:

<details><summary>
Count total entries in table.
<pre><code>table.count(expr?: string | Function = *): number</code></pre></summary>

*└ Spec:*

+ `expr` (string | Function = *, *optional*): a string denoting column name, or a function that recieves a *Field* object with which to build an expression. Defaults to `*`.
+ Return value: number.

##### ✨ Usage:

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
<pre><code>table.select(fields?: (string | Function)[] = *, where?: number | object | Function | true): Promise&lt;Array&lt;object&gt;&gt;</code></pre>
<pre><code>table.select(where?: number | object | Function): Promise&lt;Array&lt;object&gt;&gt;</code></pre></summary>

*└ Spec:*

+ `fields` ((string | Function)[] = *, *optional*): a array of fields to select. (A field being either a string denoting column name, or a function that recieves a *Field* object with which to build an expression.)
+ `where` (number | object | Function | true, *optional*): a number denoting primary key value of the target row, or an object specifying some column name/column value conditions, or a function that recieves an *Assertion* object with which to build the conditions, or the value `true` denoting all records. Defaults to `true`.
+ Return value: an array (the result set).

##### ✨ Usage:

```js
// Select all fields (*) from all records
const result = await table.select();
```

```js
// Select specified fields from the record having primary key value of 4
const result = await table.select(['first_name', 'last_name', 'email'], 4);
```

```js
// Select record by primary key value, ommiting fields (implying all fields)
const result = await table.select(4);
```

```js
// Select record by some column name/column value conditions, ommiting fields (implying all fields)
const result = await table.select({ first_name: 'John', last_name: 'Doe' });
```

</details>

#### `table.insert()`:

<details><summary>
Dynamically run an <code>INSERT</code> operation.
<pre><code>table.insert(payload: object | object[], returnList?: (string | Function)[]): Promise&lt;Savepoint&gt;</code></pre>
<pre><code>table.insert(columns: string[], values: any[][], returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | boolean&gt;</code></pre></summary>

*└ Spec:*

+ `payload` (object | object[]): an object denoting a single entry, or an array of said objects denoting multiple entries. (An entry having the general form: `{ [key: string]: string | number | boolean | null | Date | object | any[] }` where arrays and objects as values are acceptable only for JSON columns.)
+ `columns` (string[]): just column names (as against the key/value-based `payload` in the first call pattern).
+ `values` (any[][]): a two-dimensional array of just values (as against the key/value-based `payload` in the first call pattern), denoting multiple entries. 
+ `returnList` (((string | Function)[] | false), *optional*): a list of fields, corresponding to a [select list](#tableselect), specifying data to be returned from the just inserted row. (Equivalent to Postgres' [RETURNING clause](https://www.postgresql.org/docs/current/dml-returning.html), but supported for other DB kinds in Linked QL.)
+ Return value: an array (the new row being automatically returned), or the value `true`, where that behaviour has been explicitly disbaled with `returnList` set to `false`.

##### ✨ Usage:

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
// Insert single entry, obtaining inserted row - which is itself streamlined to just the "id" column
const insertedRow = await table.insert({ first_name: 'John', last_name: 'Doe', email: 'johndoe@example.com'}, ['id']);
```

</details>

#### `table.upsert()`:

<details><summary>
Dynamically run an <code>UPSERT</code> operation.
<pre><code>table.upsert(payload: object | object[], returnList?: (string | Function)[]): Promise&lt;Savepoint&gt;</code></pre>
<pre><code>table.upsert(columns: string[], values: any[][], returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | boolean&gt;</code></pre></summary>

*└ Spec:*

+ `payload` (object | object[]): as described in [`insert()`](#tableinsert).
+ `columns` (string[]): as described in [`insert()`](#tableinsert).
+ `values` (any[][]): as described in [`insert()`](#tableinsert).
+ `returnList` ((string | Function)[], *optional*): as described in [`insert()`](#tableinsert).
+ Return value: as described in [`insert()`](#tableinsert).

##### ✨ Usage:

An `UPSERT` operation is an `INSERT` operation that automatically converts to an `UPDATE` operation where given record already exists. API usage is same as [`insert()`](#tableinsert) but as `upsert()`.

</details>

#### `table.update()`:

<details><summary>
Dynamically run an <code>UPDATE</code> operation.
<pre><code>table.update(where: number | object | Function | true, payload: object, returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | boolean&gt;</code></pre></summary>

*└ Spec:*

+ `where` (number | object | Function | true): as described in [`select()`](#tableselect).
+ `payload` (object): an object having the general form: `{ [key: string]: string | number | boolean | null | Date | object | any[] }` where arrays and objects as values are acceptable only for JSON columns.
+ `returnList` ((string | Function)[], *optional*): as described in [`insert()`](#tableinsert).
+ Return value: as described in [`insert()`](#tableinsert).

##### ✨ Usage:

```js
// Update the record having primary key value of 4
await table.update(4, { first_name: 'John', last_name: 'Doe' });
```

```js
// Update the record having specified email value, obtaining the updated row
const updatedRow = await table.update({ email: 'johndoe@example.com' }, { first_name: 'John', last_name: 'Doe' });
```

```js
// Update all records
await table.update(true, { updated_at: new Date });
```
</details>

#### `table.delete()`:

<details><summary>
Dynamically run a <code>DELETE</code> operation.
<pre><code>table.delete(where: number | object | Function | true, returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | boolean&gt;</code></pre></summary>

*└ Spec:*

+ `where` (number | object | Function | true): as described in [`select()`](#tableselect).
+ `returnList` ((string | Function)[], *optional*): as described in [`insert()`](#tableinsert).
+ Return value: as described in [`insert()`](#tableinsert).

##### ✨ Usage:

```js
// Delete the record having primary key value of 4
await table.delete(4);
```

```js
// Delete the record having specified email, obtaining the deleted row
const deletedRow = await table.delete({ email: 'johndoe@example.com' });
```

```js
// Delete all records
await table.delete(true);
```
</details>

------------

### The `Savepoint` API

*Savepoint* is an object representation of a database's savepoint. This object is obtained either via [`database.savepoint()`](#databasesavepoint) or via a `CREATE`, `ALTER`, or `DROP` operation.

<details><summary>See content</summary>

+ [`savepoint.id`](#savepointid)
+ [`savepoint.databaseTag`](#savepointdatabasetag)
+ [`savepoint.versionTag`](#savepointversiontag)
+ [`savepoint.versionMax`](#savepointversionmax)
+ [`savepoint.cursor`](#savepointcursor)
+ [`savepoint.description`](#savepointdescription)
+ [`savepoint.savepointDate`](#savepointsavepointdate)
+ [`savepoint.rollbackDate`](#savepointrollbackdate)
+ [`savepoint.rollbackEffect`](#savepointrollbackoutcome)
+ [`savepoint.isNextPointInTime()`](#savepointisnextpointintime)
+ [`savepoint.rollback()`](#savepointrollback)
+ [`savepoint.toJson()`](#savepointtojson)
+ [`savepoint.schema()`](#savepointschema)
+ [`savepoint.name()`](#savepointname)

</details>

#### `savepoint.id`:

<details><summary>
The UUID associated with the savepoint.
<pre><code>savepoint.id: (UUID, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.id); // f740d66a-df5f-4a34-a281-8ef3ba6fe754
```

</details>

#### `savepoint.databaseTag`:

<details><summary>
The subject database's generic identifier that transcends name changes.
<pre><code>savepoint.databaseTag: (string, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

Consider a database's generic identifier before and after a name change:

```js
// Before name change
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.databaseTag); // db:18m6z
```

```js
// Name change
await client.alterDatabase('test_db', schema => schema.name('test_db_new'));
```

```js
// After name change
const savepoint = await client.database('test_db_new').savepoint();
console.log(savepoint.databaseTag); // db:18m6z
```

</details>

#### `savepoint.versionTag`:

<details><summary>
The savepoint's version tag.
<pre><code>savepoint.versionTag: (number, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const savepoint = await client.createDatabase({
    name: 'test_db',
    tables: [{
        name: 'test_tbl1',
        columns: [],
    }]
});
console.log(savepoint.versionTag); // 1
```

```js
const savepoint = await client.database('test_db').createTable({
    name: 'test_tbl2',
    columns: [],
});
console.log(savepoint.versionTag); // 2
```

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.versionTag); // 2
```

</details>

#### `savepoint.versionMax`:

<details><summary>
The database's all-time peak version regardless of its current rollback level.
<pre><code>savepoint.versionMax: (number, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.versionTag); // 2
console.log(savepoint.versionMax); // 2
```

```js
await savepoint.rollback();
```

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.versionTag); // 1
console.log(savepoint.versionMax); // 2
```

</details>

#### `savepoint.cursor`:

<details><summary>
The savepoint's current level in the database's list of available savepoints.
<pre><code>savepoint.cursor: (string, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.cursor); // 1/2
```

</details>

#### `savepoint.description`:

<details><summary>
The description for the changes associated with the savepoint.
<pre><code>savepoint.description: (string, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const savepoint = await client.database('test_db').createTable({
    name: 'test_tbl2',
    columns: [],
}, { description: 'Create test_tbl2' });
console.log(savepoint.description); // Create test_tbl2
```

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.description); // Create test_tbl2
```

</details>

#### `savepoint.savepointDate`:

<details><summary>
The savepoint's creation date.
<pre><code>savepoint.savepointDate: (Date, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.savepointDate); // 2024-07-20T15:31:06.096Z
```

</details>

#### `savepoint.rollbackDate`:

<details><summary>
The savepoint's rollback date.
<pre><code>savepoint.rollbackDate: (Date, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

```js
const savepoint = await client.database('test_db').createTable({
    name: 'test_tbl2',
    columns: [],
}, { description: 'Create test_tbl2' });
console.log(savepoint.rollbackDate); // null
```

```js
await savepoint.rollback();
console.log(savepoint.rollbackDate); // 2024-07-20T15:31:06.096Z
```

```js
// Find the same savepoint with a forward lookup
const savepoint = await client.database('test_db').savepoint({ direction: 'forward' });
console.log(savepoint.rollbackDate); // 2024-07-20T15:31:06.096Z
```

</details>

#### `savepoint.rollbackEffect`:

<details><summary>
The effect that rolling back to this savepoint will have on subject DB.
<pre><code>savepoint.rollbackEffect: (string, <i>readonly</i>)</code></pre></summary>

##### ✨ Usage:

Will rolling back to given savepoint create or drop the subject database?:

For create operation...

```js
const savepoint = await client.createDatabase('test_db', { descripton: 'Create db' });
```
Rolling back will mean dropping the DB:

```js
console.log(savepoint.descripton); // Create db
console.log(savepoint.rollbackEffect); // DROP
```

```js
// Drop DB
await savepoint.rollback();
console.log(savepoint.rollbackEffect); // DROP
```

Having rolled back, rolling forward will mean a re-creation of the DB:

```js
// Find the same savepoint with a forward lookup
const savepoint = await client.database('test_db').savepoint({ direction: 'forward' });
// Now rolling back will mean re-creating the DB
console.log(savepoint.descripton); // Create db
console.log(savepoint.rollbackEffect); // CREATE
```

Compare with that of rolling back table-level operations - which always just has an `ALTER` effect:

```js
// Create table - which translates to a DB "alter" operation
const savepoint = await client.database('test_db').createTable({
    name: 'test_tbl2',
    columns: [],
}, { description: 'Create test_tbl2' });
// Rolling back will mean dropping the table - which will still translate to a DB "alter" operation
console.log(savepoint.descripton); // Create test_tbl2
console.log(savepoint.rollbackEffect); // ALTER
```

```js
// Drop DB
await savepoint.rollback();
console.log(savepoint.rollbackEffect); // ALTER
```

```js
// Find the same savepoint with a forward lookup
const savepoint = await client.database('test_db').savepoint({ direction: 'forward' });
// Now rolling back will mean re-creating the table - which will still translate to a DB "alter" operation
console.log(savepoint.descripton); // Create test_tbl2
console.log(savepoint.rollbackEffect); // ALTER
```

</details>

#### `savepoint.isNextPointInTime()`:

<details><summary>
Check if the savepoint is the next actual <i>point in time</i> for the database.
<pre><code>savepoint.isNextPointInTime(): Promise&lt;boolean&gt;</code></pre></summary>

*└ Spec:*

+ Return value: boolean.

##### ✨ Usage:

For a new operation, that would be true:

```js
const dbCreationSavepoint = await client.createDatabase('test_db');
console.log(await dbCreationSavepoint.isNextPointInTime()); // true
```

But after having performed more operations, that wouldn't be:

```js
const tblCreationSavepoint = await client.database('test_db').createTable({
    name: 'test_tbl',
    columns: [{
        name: 'id',
        type: 'int'
    }]
});
console.log(await tblCreationSavepoint.isNextPointInTime()); // true
console.log(await dbCreationSavepoint.isNextPointInTime()); // false
```

Rollback table creation and test `dbCreationSavepoint`'s position again:

```js
await tblCreationSavepoint.rollback();
console.log(await tblCreationSavepoint.isNextPointInTime()); // false
console.log(await dbCreationSavepoint.isNextPointInTime()); // true
```

</details>

#### `savepoint.rollback()`:

<details><summary>
Rollback all changes associated with given savepoint.
<pre><code>savepoint.rollback(): Promise&lt;boolean&gt;</code></pre></summary>

*└ Spec:*

+ Return value: boolean.

##### ✨ Usage:

Create database and rollback:

```js
// Create DB
const savepoint = await client.createDatabase('test_db', { descripton: 'Create db' });
// Roll back - which means drop the DB
await savepoint.rollback();
```

Undo the rollback; i.e. roll forward:

```js
// Find the same savepoint with a forward lookup
const savepoint = await client.database('test_db').savepoint({ direction: 'forward' });
// Roll back - which means re-create the DB
await savepoint.rollback();
```

</details>

#### `savepoint.toJson()`:

<details><summary>
Get a plain object representation of the savepoint.
<pre><code>savepoint.toJson(): object</code></pre></summary>

*└ Spec:*

+ Return value: an object of the form `{ id: string, name: string, databaseTag: string, versionTag: number, versionMax: number, cursor: string, description: string, savepointDate: Date, rollbackDate: Date | null }`.

##### ✨ Usage:

```js
const savepoint = await client.createDatabase('test_db', { descripton: 'Create db' });
console.log(savepoint.toJson());
```

</details>

#### `savepoint.schema()`:

<details><summary>
Get the subject DB's schema snapshot at this point in time.
<pre><code>savepoint.schema(): object</code></pre></summary>

*└ Spec:*

+ Return value: an object corresponding to the [database JSON schema](#schemajson).

##### ✨ Usage:

```js
const savepoint = await client.database('test_db').createTable({
    name: 'test_tbl',
    columns: [{
        name: 'id',
        type: 'int'
    }]
});
console.log(savepoint.schema());
```

```js
const savepoint = await client.database('test_db').savepoint();
await savepoint.schema();
```

</details>

#### `savepoint.name()`:

<details><summary>
Get the subject database's name.
<pre><code>savepoint.name(postRollback?: boolean): string</code></pre></summary>

*└ Spec:*

+ `postRollback` (boolean, *optional*): in case a name change was captured in the savepoint, whether to return the database's post-rollback name. Otherwise the database's active, pre-rollback name is returned.
+ Return value: the database name.

##### ✨ Usage:

```js
// Name change
const savepoint = await client.alterDatabase('test_db', schema => schema.name('test_db_new'));
// The database's active, pre-rollback name
console.log(savepoint.name()); // test_db_new
// The database's post-rollback name
console.log(savepoint.name(true)); // test_db
```

</details>

------------

## Linked QL CLI

*(TODO)*

## Linked QL Schemas

*(TODO)*

## Roadmap

+ Implement support for IndexedDB and in-mem.

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
