# Linked QL

[![npm version][npm-version-src]][npm-version-href]<!--[![npm downloads][npm-downloads-src]][npm-downloads-href]-->
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

❄️ **_Save the overhead working with SQL and structured data - from the time and effort spent figuring out relational queries to the labour managing schemas!_** Try a modern, simplistic take on SQL and databases in general!

Linked QL is a DB query client that simplfies how you interact with your database and manage your schemas.

💥 Takes the ORM and friends out of the way and let's you just write SQL, but SQL that you will actually enjoy. (Linked QL extends standard SQL with [new syntax sugars](#introducing-magic-paths) that let you write relational queries in less than half the code and without a single JOIN clause in most cases.)

⚡️ Takes the process out of schema management and lets you just *ALTER* away your DB, but in a safety net. (Linked QL extends your DB behind the scenes to [automatically version](#introducing-auto-versioning) each edit you make and have them kept as "savepoints" that you can always rollback to.)

💥 Brings the "schema-as-code" practice to its true meaning and essentially lets you have your entire DB structure go in a single [`schema.json` file](#re-introducing-schema-as-code-with-schemajson) that you edit in-place, as against the "hundreds of migration files" experience. (Linked QL essentially rewrites your "migrations" experience.)

It comes as a small library and is usable over your DB of choice - from the server-side Postgres, mariadb and MySQL, to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), to the plain JSON object!

Jump to sections and features:

+ [Getting Started](#getting-started)
+ [Magic Paths](#introducing-magic-paths)
+ [Auto-Versioning](#introducing-auto-versioning)
+ [Schema-as-Code](#re-introducing-schema-as-code-with-schemajson)
+ [API](#linked-ql-api)
+ [CLI](#linked-ql-cli)

## Getting Started

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

Other APIs are covered just ahead in the [API](#linked-ql-api) section.

## Introducing Magic Paths

💥 *Express relationships graphically.*

JOINS can be good but can be a mess as they almost always obfuscate your entire query! But what if you didn't have to write JOINS to express certain relationships?

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

✨ PRO: *About 50% code, and whole namespacing exercise, now eliminated; all with zero upfront setup!*

Taking that further, paths can be multi-level:

```sql
-- Linked QL
SELECT * FROM books
WHERE author ~> role ~> codename = 'admin'
```

and they can also be used to express the relationships in the reverse direction (many-to-one):

```sql
-- Linked QL
SELECT * FROM users
WHERE author <~ books ~> title = 'Beauty and the Beast'
```

*(Now pivot/junction/link tables get an easier way!)*

## Introducing Auto-Versioning

⚡️ *Create, Alter, and Drop schemas without needing to worry about versioning.*

Databases have historically lacked the concept of versioning, and that has seen all of the engineering work pushed down to the client application. If you've ever had to adopt a special process for defining and managing your schemas, wherein changes are handled through *serially*-named files within your application, each written as an `UP`/`DOWN` pair of actions, and in all supported by tooling...

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

Meet Linked QL's little addition to your database that does exactly that and lets you alter your DB carefree, but in the safety net of some behind-the-scenes magic that snapshots your schema before each alteration! Meet Automatic Schema Savepoints and Rollbacks!

You:

```js
// Alter schema
const savepoint = await client.query('CREATE TABLE public.users (id int, name varchar)', {
    description: 'Create users table',
});
```

Linked QL:

```js
// A savepoint automatically created for you
console.log(savepoint.description);   // Create users table
console.log(savepoint.versionTag);    // 1
console.log(savepoint.savepointDate); // 2024-07-17T22:40:56.786Z
```

*(More details in the [Savepoint](#the-savepoint-api) API.)*

✨ PRO: *Whole engineering work now essentially moved over to the DB where it rightly belongs; all with zero upfront setup!*

Taking that further, you get a nifty rollback button should you want to:

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

You essentially are able to go *back in time* or *forward in time* as randomly as iteration may demand.

## Re-Introducing Schema-as-Code with `schema.json`

💥 *Have your entire DB structure live in a single `schema.json` (or `schema.yml`) file that you edit in-place!*

With schema versioning now over to the database, much of the old conventions and formalities should now be irrelevant. We found that we could essentially streamline the whole "database" footprint from spanning hundreds of migration files to fitting into a single `schema.json` (or `schema.yml`) file!

### `schema.json`

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

> <details><summary>See the database schema spec</summary>
> 
> ```ts
> interface DatabaseSchemaSpec {
>     name: string;
>     tables: TableSchemaSpec[];
> }
> ```
> 
> </details>

<details><summary>Explore the structure further</summary>

-------------

└ *Table schema example:*

```js
{
    "name": "users", // or something like ['db1', 'tbl1'] which would translate to db1.tbl1
    "columns": [], // Column objects (minimum of 1)
    "constraints": [], // Constraint objects
    "indexes": [] // Index objects
}
```

> <details><summary>See the table schema spec</summary>
> 
> ```ts
> interface TableSchemaSpec {
>     name: string | string[];
>     columns: ColumnSchemaSpec[];
>     constraints: TableConstraintSchemaType[];
>     indexes: IndexSchemaSpec[];
> }
> ```
> 
> </details>

-------------

└ *Column schema examples:*

```js
{
    "name": "id",
    "type": "int",
    "primaryKey": true,
    "identity": true
}
```

```js
{
    "name": "full_name",
    "type": ["varchar", 101],
    "generated": "(first_name || ' ' || last_name)"
}
```

```js
{
    "name": "email",
    "type": ["varchar", "50"],
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

> <details><summary>See the column schema spec</summary>
> 
> ```ts
> interface ColumnSchemaSpec {
>     name: string;
>     type: string | Array;
>     primaryKey?: boolean | PrimaryKeySchemaSpec;
>     [ foreignKey | references ]?: ForeignKeySchemaSpec;
>     uniqueKey?: boolean | UniqueKeySchemaSpec;
>     check?: string | CheckConstraintSchemaSpec;
>     default?: string | DefaultConstraintSchemaSpec;
>     expression?: string | ExpressionConstraintSchemaSpec;
>     identity: boolean | IdentityConstraintSchemaSpec;
>     onUpdate?: string | OnUpdateConstraintSchemaSpec; // (MySQL-specific attributes)
>     autoIncrement?: boolean; // (MySQL-specific attributes)
>     notNull?: boolean;
>     null?: boolean;
> }
> ```
> 
> </details>

---------------

└ *Table constraint examples:*

```js
{
    "type": "PRIMARY_KEY",
    "name": "constraint_name",
    "columns": ["id"],
}
```

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
    "targetTable": "users", // or something like ['db1', 'tbl1'] which would translate to db1.tbl1
    "targetColumns": ["id"],
    "matchRull": "full",
    "updateRule": "cascade",
    "deleteRule": { rule: "restrict", "columns": ["col1", "col2"] }
}
```

```js
{
    "type": "CHECK",
    "expr": "(email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')"
}
```

> <details><summary>See the table constraint schema spec</summary>
> 
> ```ts
> type TableConstraintSchemaType = TablePrimaryKeySchemaSpec | TableForeignKeySchemaSpec | TableUniqueKeySchemaSpec | TableCheckConstraintSchemaSpec;
> ```
> 
> ```ts
> interface TablePrimaryKeySchemaSpec extends PrimaryKeySchemaSpec {
>     type: 'PRIMARY_KEY';
>     columns: string[];
> }
> 
> interface TableForeignKeySchemaSpec extends ForeignKeySchemaSpec {
>     type: 'FOREIGN_KEY';
>     columns: string[];
> }
> 
> interface TableUniqueKeySchemaSpec extends UniqueKeySchemaSpec {
>     type: 'UNIQUE_KEY';
>     columns: string[];
> }
> 
> interface TableCheckConstraintSchemaSpec extends CheckConstraintSchemaSpec {
>     type: 'CHECK';
> }
> ```
> 
> </details>

> <details><summary>See the column constraint schema spec</summary>
> 
> ```ts
> type ColumnConstraintSchemaType = PrimaryKeySchemaSpec | ForeignKeySchemaSpec | UniqueKeySchemaSpec | CheckConstraintSchemaSpec | DefaultConstraintSchemaSpec | ExpressionConstraintSchemaSpec | IdentityConstraintSchemaSpec | OnUpdateConstraintSchemaSpec;
> ```
> 
> ```ts
> interface PrimaryKeySchemaSpec {
>     name: string;
> }
> 
> interface ForeignKeySchemaSpec {
>     name?: string;
>     targetTable: string | string[];
>     targetColumns: string[];
>     matchRule?: string;
>     updateRule?: string | { rule: string, columns: string[] };
>     deleteRule?: string | { rule: string, columns: string[] };
> }
> 
> interface UniqueKeySchemaSpec {
>     name: string;
> }
> 
> interface CheckConstraintSchemaSpec {
>     name?: string;
>     expr: string;
> }
> 
> interface DefaultConstraintSchemaSpec {
>     expr: string;
> }
> 
> interface ExpressionConstraintSchemaSpec {
>     expr: string;
>     stored: boolean;
> }
> 
> interface IdentityConstraintSchemaSpec {
>     always: boolean;
> }
> 
> interface OnUpdateConstraintSchemaSpec {
>     expr: string;
> }
> ```
> 
> </details>

-------------

└ *Index schema examples:*

```js
{
    "type": "FULLTEXT",
    "columns": ["full_name"]
}
```

```js
{
    "type": "SPATIAL",
    "columns": ["full_name"]
}
```

> <details><summary>See the index schema spec</summary>
> 
> ```ts
> interface IndexSchemaSpec {
>     type: string;
>     columns: string[];
> }
> ```
> 
> </details>

</details>

Now, if you had that somewhere in your application, say at `./database/schema.json`, Linked QL could help keep it in sync both ways with your database:

+ you add or remove a database object or table object or column object... and it is automatically reflected in your DB structure at the click of a command: `linkedql migrate`
+ your colleague makes new changes from their codebase... and it is automatically reflected in your local copy at your next `git pull`, or at the click of a command: `linkedql refresh`

🐥 You also get to see a version number on each database object in your schema essentially incrementing on each migrate operation (whether by you or by colleague), and decrementing on each rollback operation (whether by you or by colleague).

Thanks to a DB-native schema version control system, no need to maintain past states, or risk losing them; the DB now becomes the absolute source of truth for both itself and its client applications, as against the other way around. (You may want to see how that brings us to [true "Schema as Code" in practice](#test-heading).)

To setup:

1. Make a directory within your application for database concerns. Linked QL will look in `./database`, but you will be able to point to your preferred location when running Linked QL commands.

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

3. Have your DB structure defined in a `schema.json` file in that directory. (See [`schema.json`](#schemajson) above for a guide.)

    You can always extend your schema with new objects, and you can always drop objects or edit them in-place. For an existing database, table, column, constraint, or index, **names may be changed, but not in-place!** A "rename" operation is done with the addition of a temporary `$name` attribute:

    ```js
    {
        "name": "old_name",
        "$name": "new_name"
    }
    ```

    The old name being in place is needed to find the target during migration. The temporary `$name` attribute automatically disappears after new name has been picked up by Linked QL at next `linkedql migrate`.

To run:

+ Use `linkedql migrate` to walk through your staged local changes and interactively perform a migration on your database.
+ Use `linkedql rollback` to walk through the latest savepoint at each database and interactively perform a rollback.
+ Use `linkedql leaderboard` to just view the latest savepoint at each database.

*(More details in the [Linked QL CLI](#linked-ql-cli) section.)*

## Linked QL API

Here's for a quick overview of the Linked QL API:

Here we talk about the `client.query()` method in more detail along with other Linked QL APIs that essentially let you do the same things possible with `client.query()`, but this time, programmatically.

As an example of one of these APIs, a `CREATE DATABASE` operation...

```js
const savepoint = await client.query('CREATE DATABASE IF NOT EXISTS database_1');
```

could be programmatically achieved as:

```js
const savepoint = await client.createDatabase('database_1', { ifNotExists: true });
```

That said, while the `createDatabase()` method is associated with the base `Client` object, the different programmatic query APIs in Linked QL are actually organized into three hierarchical scopes:

+ the top-level scope (represented by the [`Client`](#the-client-api) interface), featuring methods such as: `createDatabase()`, `alterDatabase()`, `dropDatabase()`, `hasDatabase()`, `describeDatabase()`

+ the database-level scope (represented by a certain [`Database`](#the-database-api) interface), featuring methods such as: `createTable()`, `alterTable()`, `dropTable()`, `hasTable()`, `describeTable()`

+ the table-level scope (represented by a certain [`Table`](#the-table-api) interface), featuring methods such as: `select()`, `insert()`, `upsert()`, `update()`, `delete()`

Each object provides a way to narrow in to the next; e.g. from the top-level scope to a database scope...

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

⚙️ Spec:

+ `sql` (string): an SQL query.
+ `options` (Options, *optional*): extra parameters for the query.
+ Return value: a [`Savepoint`](#the-savepoint-api) instance when it's a `CREATE`, `ALTER`, or `DROP` operation, an array (the result set) when it's a `SELECT` query or when it's an `INSERT`, `UPDATE`, or `DELETE` operation that has a `RETURNING` clause, but a number (indicating number of rows processed by the query) when not having a `RETURNING` clause. Null in all other cases.

⚽️ Usage:

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

or an `INSERT`, `UPDATE`, or `DELETE` operation with a `RETURNING` clause, and get back a result set:

```js
const rows = await client.query('INSERT INTO users SET name = \'John Doe\' RETURNING id');
console.log(rows.length); // 1
```

or an `INSERT`, `UPDATE`, or `DELETE` operation without a `RETURNING` clause, and ge back a number indicating the number of rows processed by the query:

```js
const rowCount = await client.query('INSERT INTO users SET name = \'John Doe\'');
console.log(rowCount); // 1
```

Some additional parameters via `options`:

+ `dialect` (string, *optional*): the SQL dialect in use: `postgres` (the default) or `mysql`. (Details soon as to how this is treated by Linked QL.)

    ```js
    // Unlock certain dialect-specific clauses or conventions
    const rows = await client.query('ALTER TABLE users MODIFY COLUMN id int', { dialect: 'mysql' });
    ```
+ `values` ((string | number | boolean | null | Date | object | any[])[], *optional*): the values for parameters in the query.

    ```js
    const rows = await client.query('SELECT * FROM users WHERE id = $1', { values: [4] });
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
<pre><code>client.createDatabase(databaseNameOrJson: string | DatabaseSchemaSpec, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

⚙️ Spec:

+ `databaseNameOrJson` (string | [`DatabaseSchemaSpec`](#schemajson)): the database name, or an object specifying the intended database structure to create.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

⚽️ Usage:

Specify database by name:

```js
const savepoint = await client.createDatabase('database_1', { description: 'Just testing database creation' });
```

or by a schema object, with an optional list of tables to be created along with it. (Each listed table corresponding to `TableSchemaSpec` *(in [schema.json](#schemajson))*.):

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
<pre><code>client.alterDatabase(databaseNameOrJson: string | { name: string, tables?: string[] }, callback: (databaseSchemaApi: DatabaseSchemaAPI) => void, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

⚙️ Spec:

+ `databaseNameOrJson` (string | { name: string, tables?: string[] }): the database name, or an object with the name and, optionally, a list of tables to be altered along with it.
+ `callback` ((databaseSchemaApi: [`DatabaseSchemaAPI`](#the-databaseschemaapi-api)) => void): a function that is called with the requested schema. This can be async.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

⚽️ Usage:

Specify database by name:

```js
const savepoint = await client.alterDatabase('database_1', databaseSchemaApi => {
    databaseSchemaApi.name('database_1_new');
}, { description: 'Renaming for testing purposes' });
```

or by an object, with an optional list of tables to be altered along with it:

```js
const savepoint = await client.alterDatabase({ name: 'database_1', tables: ['table_1'] }, databaseSchemaApi => {
    databaseSchemaApi.name('database_1_new');
    databaseSchemaApi.table('table_1').column('column_1').name('column_1_new');
    databaseSchemaApi.table('table_1').column('column_2').type('varchar');
}, { description: 'Renaming for testing purposes' });
```

</details>

#### `client.dropDatabase()`:

<details><summary>
Dynamically run a <code>DROP DATABASE</code> operation.
<pre><code>client.dropDatabase(databaseName: string, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

⚙️ Spec:

+ `databaseName` (string): the database name.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

⚽️ Usage:

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
<pre><code>client.hasDatabase(databaseName: string): Promise&lt;Boolean&gt;</code></pre></summary>

⚙️ Spec:

+ `databaseName` (string): the database name.
+ Return value: Boolean.

⚽️ Usage:

```js
const exists = await client.hasDatabase('database_1');
```

</details>

#### `client.describeDatabase()`:

<details><summary>
Get the schema structure for a database.
<pre><code>client.describeDatabase(databaseName: string): Promise&lt;DatabaseSchemaSpec&gt;</code></pre></summary>

⚙️ Spec:

+ `databaseName` (string): the database name.
+ Return value: an object corresponding to [`DatabaseSchemaSpec`](#schemajson); the requested schema.

⚽️ Usage:

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

⚙️ Spec:

+ Return value: an array of database names.

⚽️ Usage:

```js
const databases = await client.databases();
console.log(databases); // ['public', 'database_1', ...]
```

</details>

#### `client.database()`:

<details><summary>
Obtain a <code>Database</code> instance.
<pre><code>client.database(databaseName: string): Database</code></pre></summary>

⚙️ Spec:

+ `databaseName` (string): the database name.
+ Return value: a [`Database`](#the-database-api) instance.

⚽️ Usage:

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

⚽️ Usage:

```js
const database = client.database('test_db');
console.log(database.name); // test_db
```

</details>

#### `database.createTable()`:

<details><summary>
Dynamically run a <code>CREATE TABLE</code> operation.
<pre><code>database.createTable(tableJson: TableSchemaSpec, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

⚙️ Spec:

+ `tableJson` ([`TableSchemaSpec`](#schemajson)): an object specifying the intended table structure to create.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

⚽️ Usage:

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
<pre><code>database.alterTable(tableName: string, callback: (tableSchemaApi: TableSchemaAPI) => void, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

⚙️ Spec:

+ `tableName` (string): the table name.
+ `callback` ((tableSchemaApi: [`TableSchemaAPI`](#the-tableschemaapi-api)) => void): a function that is called with the requested table schema. This can be async.
+ `options`  (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.name('table_1_new');
    tableSchemaApi.column('column_1').type('int');
    tableSchemaApi.column('column_2').drop();
}, { description: 'Renaming for testing purposes' });
```

</details>

#### `database.dropTable()`:

<details><summary>
Dynamically run a <code>DROP TABLE</code> operation.
<pre><code>database.dropTable(tableName: string, options?: Options): Promise&lt;Savepoint&gt;</code></pre></summary>

⚙️ Spec:

+ `tableName` (string): the table name.
+ `options` (Options, *optional*): as described in [`query()`](#clientquery).
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

⚽️ Usage:

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
<pre><code>database.hasTable(tableName: string): Promise&lt;Boolean&gt;</code></pre></summary>

⚙️ Spec:

+ `tableName` (string): the table name.
+ Return value: Boolean.

⚽️ Usage:

```js
const exists = await database.hasTable('table_1');
```

</details>

#### `database.describeTable()`:

<details><summary>
Get the schema structure for a table.
<pre><code>database.describeTable(tableName: string): Promise&lt;TableSchemaSpec&gt;</code></pre></summary>

⚙️ Spec:

+ `tableName` (string): the table name.
+ Return value: an object corresponding to [`TableSchemaSpec`](#schemajson); the requested schema.

⚽️ Usage:

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

⚙️ Spec:

+ Return value: an array of table names.

⚽️ Usage:

```js
const tables = await database.tables();
console.log(tables); // ['table_1', 'table_2', ...]
```

</details>

#### `database.table()`:

<details><summary>
Obtain a <code>Table</code> instance.
<pre><code>database.table(tableName: string): Table</code></pre></summary>

⚙️ Spec:

+ `tableName` (string): the table name.
+ Return value: a [`Table`](#the-table-api) instance.

⚽️ Usage:

```js
const table = database.table('table_1');
```

</details>

#### `database.savepoint()`:

<details><summary>
Obtain the next available <i>savepoint</i> for given database.
<pre><code>database.savepoint(options?: { direction: string }): Savepoint</code></pre></summary>

⚙️ Spec:

+ `options` ({ direction: string }, *optional*): extra paramters for the method.
+ Return value: a [`Savepoint`](#the-savepoint-api) instance.

⚽️ Usage:

```js
const savepoint = await database.savepoint();
console.log(savepoint.versionTag); // number

await savepoint.rollback(); // true
```

Some additional parameters via `options`:

+ `direction` (string, *optional*): the direction of lookup - either back in time: `backward` (the default), or forward in time: `forward`.

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

⚽️ Usage:

```js
const table = client.database('test_db').table('table_1');
console.log(table.name); // table_1
```

</details>

#### `table.count()`:

<details><summary>
Count total entries in table.
<pre><code>table.count(expr?: string | Function = *): Promise&lt;number&gt;</code></pre></summary>

⚙️ Spec:

+ `expr` (string | Function = *, *optional*): a string denoting column name, or a function that recieves a *Field* object with which to build an expression. Defaults to `*`.
+ Return value: number.

⚽️ Usage:

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

⚙️ Spec:

+ `fields` ((string | Function)[] = *, *optional*): an array of fields to select. (A field being either a column name string, or a function that recieves a *Field* object with which to build an expression.)
+ `where` (number | object | Function | true, *optional*): a number targeting the primary key value of the target row, or an object specifying some column name/column value conditions, or a function that recieves an *Assertion* object with which to build the conditions, or the value `true` denoting all records. Defaults to `true`.
+ Return value: an array (the result set).

⚽️ Usage:

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
Dynamically run an <code>INSERT</code> operation. (With automatic parameter binding.)
<pre><code>table.insert(payload: object | object[], returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | number&gt;</code></pre>
<pre><code>table.insert(columns: string[], values: any[][], returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | number&gt;</code></pre></summary>

⚙️ Spec:

+ `payload` (object | object[]): an object denoting a single entry, or an array of said objects denoting multiple entries. (An entry having the general form: `{ [key: string]: string | number | boolean | null | Date | object | any[] }` where arrays and objects as values are automatically JSON-stringified.)
+ `columns` (string[]): just column names (as against the key/value `payload` in the first call pattern).
+ `values` (any[][]): a two-dimensional array of just values (as against the key/value `payload` in the first call pattern), denoting multiple entries.
+ `returnList` (((string | Function)[] | false), *optional*): a list of fields, corresponding to a [select list](#tableselect), specifying data to be returned from the just inserted row. (Equivalent to Postgres' [RETURNING clause](https://www.postgresql.org/docs/current/dml-returning.html), but supported for other DB kinds in Linked QL.)
+ Return value: a number indicating number of rows processed by the query, or where `returnList` was provided, an array of the processed row(s).

⚽️ Usage:

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
// Insert single entry, obtaining inserted rows - which is itself streamlined to just the "id" column
const insertedRows = await table.insert({ first_name: 'John', last_name: 'Doe', email: 'johndoe@example.com'}, ['id']);
```

</details>

#### `table.upsert()`:

<details><summary>
Dynamically run an <code>UPSERT</code> operation. (With automatic parameter binding.)
<pre><code>table.upsert(payload: object | object[], returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | number&gt;</code></pre>
<pre><code>table.upsert(columns: string[], values: any[][], returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | number&gt;</code></pre></summary>

⚙️ Spec:

+ `payload` (object | object[]): as described in [`insert()`](#tableinsert).
+ `columns` (string[]): as described in [`insert()`](#tableinsert).
+ `values` (any[][]): as described in [`insert()`](#tableinsert).
+ `returnList` ((string | Function)[], *optional*): as described in [`insert()`](#tableinsert).
+ Return value: as described in [`insert()`](#tableinsert).

⚽️ Usage:

An `UPSERT` operation is an `INSERT` operation that automatically converts to an `UPDATE` operation where given record already exists. API usage is same as [`insert()`](#tableinsert) but as `upsert()`.

</details>

#### `table.update()`:

<details><summary>
Dynamically run an <code>UPDATE</code> operation. (With automatic parameter binding.)
<pre><code>table.update(where: number | object | Function | true, payload: object, returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | number&gt;</code></pre></summary>

⚙️ Spec:

+ `where` (number | object | Function | true): as described in [`select()`](#tableselect).
+ `payload` (object): an object having the general form: `{ [key: string]: string | number | boolean | null | Date | object | any[] }` where arrays and objects as values are automatically JSON-stringified.
+ `returnList` ((string | Function)[], *optional*): as described in [`insert()`](#tableinsert).
+ Return value: as described in [`insert()`](#tableinsert).

⚽️ Usage:

```js
// Update the record having primary key value of 4
await table.update(4, { first_name: 'John', last_name: 'Doe' });
```

```js
// Update the record having specified email value, obtaining the updated rows
const updatedRows = await table.update({ email: 'johndoe@example.com' }, { first_name: 'John', last_name: 'Doe' }, ['*']);
```

```js
// Update all records
await table.update(true, { updated_at: new Date });
```
</details>

#### `table.delete()`:

<details><summary>
Dynamically run a <code>DELETE</code> operation. (With automatic parameter binding.)
<pre><code>table.delete(where: number | object | Function | true, returnList?: (string | Function)[]): Promise&lt;Array&lt;object&gt; | number&gt;</code></pre></summary>

⚙️ Spec:

+ `where` (number | object | Function | true): as described in [`select()`](#tableselect).
+ `returnList` ((string | Function)[], *optional*): as described in [`insert()`](#tableinsert).
+ Return value: as described in [`insert()`](#tableinsert).

⚽️ Usage:

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

⚽️ Usage:

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.id); // f740d66a-df5f-4a34-a281-8ef3ba6fe754
```

</details>

#### `savepoint.databaseTag`:

<details><summary>
The subject database's generic identifier that transcends name changes.
<pre><code>savepoint.databaseTag: (string, <i>readonly</i>)</code></pre></summary>

⚽️ Usage:

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
// Now even after name change
const savepoint = await client.database('test_db_new').savepoint();
console.log(savepoint.databaseTag); // db:18m6z
```

</details>

#### `savepoint.versionTag`:

<details><summary>
The savepoint's version tag.
<pre><code>savepoint.versionTag: (number, <i>readonly</i>)</code></pre></summary>

⚽️ Usage:

```js
// Version 1
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
// Version 2
const savepoint = await client.database('test_db').createTable({
    name: 'test_tbl2',
    columns: [],
});
console.log(savepoint.versionTag); // 2
```

```js
// Version 2 currently
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.versionTag); // 2
```

</details>

#### `savepoint.versionMax`:

<details><summary>
The database's peak version regardless of its current rollback level.
<pre><code>savepoint.versionMax: (number, <i>readonly</i>)</code></pre></summary>

⚽️ Usage:

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

⚽️ Usage:

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.cursor); // 1/2
```

</details>

#### `savepoint.description`:

<details><summary>
The description for the changes associated with the savepoint.
<pre><code>savepoint.description: (string, <i>readonly</i>)</code></pre></summary>

⚽️ Usage:

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

⚽️ Usage:

```js
const savepoint = await client.database('test_db').savepoint();
console.log(savepoint.savepointDate); // 2024-07-20T15:31:06.096Z
```

</details>

#### `savepoint.rollbackDate`:

<details><summary>
The savepoint's rollback date.
<pre><code>savepoint.rollbackDate: (Date, <i>readonly</i>)</code></pre></summary>

⚽️ Usage:

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
A single-word summary of the effect that rolling back to this savepoint will have on subject DB.
<pre><code>savepoint.rollbackEffect: (string, <i>readonly</i>)</code></pre></summary>

⚽️ Usage:

Will rolling back to given savepoint mean dropping or re-creating the subject database?:

For a create operation...

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
console.log(savepoint.rollbackEffect); // DROP
await savepoint.rollback();
```

Having rolled back, rolling forward will mean a re-creation of the DB:

```js
// Find the same savepoint with a forward lookup
const savepoint = await client.database('test_db').savepoint({ direction: 'forward' });
// Now rolling back will mean re-creating the DB
console.log(savepoint.descripton); // Create db
console.log(savepoint.rollbackEffect); // CREATE
```

But note that table-level create/drop operations always only have an `ALTER` effect on parent DB:

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

#### `savepoint.rollbackQuery`:

<details><summary>
A query preview of the rollback.
<pre><code>savepoint.rollbackQuery: ({ toString(): string }, <i>readonly</i>)</code></pre></summary>

⚽️ Usage:

You get a query instance that is *toString()able*:

For a create operation...

```js
const savepoint = await client.createDatabase('test_db', { descripton: 'Create db' });
```

Rolling back will mean dropping the DB:

```js
console.log(savepoint.rollbackQuery.toString()); // DROP SCHEMA test_db CASCADE
```

</details>

#### `savepoint.isNextPointInTime()`:

<details><summary>
Check if the savepoint is the next actual <i>point in time</i> for the database.
<pre><code>savepoint.isNextPointInTime(): Promise&lt;boolean&gt;</code></pre></summary>

⚙️ Spec:

+ Return value: boolean.

⚽️ Usage:

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

⚙️ Spec:

+ Return value: boolean.

⚽️ Usage:

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

⚙️ Spec:

+ Return value: an object of the form `{ id: string, name: string, databaseTag: string, versionTag: number, versionMax: number, cursor: string, description: string, savepointDate: Date, rollbackDate: Date | null }`.

⚽️ Usage:

```js
const savepoint = await client.createDatabase('test_db', { descripton: 'Create db' });
console.log(savepoint.toJson());
```

</details>

#### `savepoint.schema()`:

<details><summary>
Get the subject DB's schema snapshot at this point in time.
<pre><code>savepoint.schema(): object</code></pre></summary>

⚙️ Spec:

+ Return value: an object corresponding to `DatabaseSchemaSpec` *(in [schema.json](#schemajson))*.

⚽️ Usage:

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

⚙️ Spec:

+ `postRollback` (boolean, *optional*): in case a name change was captured in the savepoint, whether to return the database's post-rollback name. Otherwise the database's active, pre-rollback name is returned.
+ Return value: the database name.

⚽️ Usage:

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

### The `DatabaseSchemaAPI` API

*DatabaseSchemaAPI* is the programmatic interface to `DatabaseSchemaSpec` *(in [schema.json](#schemajson))*. This object is obtained via [`client.alterDatabase()`](#clientalterdatabase)'s callback function.

*DatabaseSchemaAPI inherits from [`AbstractSchemaAPI`](#the-abstractschemaapi-api).*

<details><summary>See content</summary>

+ [`databaseSchemaApi.name()`](#databaseschemaapiname)
+ [`databaseSchemaApi.table()`](#databaseschemaapitable)

    *Inherited:*

+ [`abstractSchemaApi.toJson()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

#### `databaseSchemaApi.name()`:

<details><summary>
Set or get the database name. <i>(Overrides <code><a href="#abstractschemaapiname">abstractSchemaApi.name()</a></code>.)</i>
<pre><code>databaseSchemaApi.name(name?: string): this</code></pre></summary>

⚙️ Spec:

+ `name` (string, *optional*): when provided, sets the database name. When ommitted, gets the database name returned.
+ Return value: `Identifier` - the current database name, or `this` - the `databaseSchemaApi` instance.

⚽️ Usage:

Rename the database:

```js
const savepoint = await client.alterDatabase('database_1', databaseSchemaApi => {
    // Inspect existing name
    console.log(databaseSchemaApi.name().toJson()); // database_1
    // Rename
    databaseSchemaApi.name('new_database_1');
}, { description: 'Renaming for testing purposes' });
```

</details>

#### `databaseSchemaApi.table()`:

<details><summary>
Add a table to the database or get an existing one.
<pre><code>databaseSchemaApi.table(tableNameOrJson: string | TableSchemaSpec): TableSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `tableNameOrJson` (string | [`TableSchemaSpec`](#schemajson)): when a string, the name of a table to get. When an object, an object that defines a new table to create.
+ Return value: [`TableSchemaAPI`](#the-tableschemaapi-api) - the table schema requested or the one just added.

⚽️ Usage:

```js
const savepoint = await client.alterDatabase('database_1', databaseSchemaApi => {
    // Drop existing table_1
    databaseSchemaApi.table('table_1').drop();
    // Add table_2
    databaseSchemaApi.table({
        name: 'table_2',
        columns: [],
    });
}, { description: 'Altering for testing purposes' });
```

</details>

------------

### The `TableSchemaAPI` API

*TableSchemaAPI* is the programmatic interface to `TableSchemaSpec` *(in [schema.json](#schemajson))*. This object is obtained via [`databaseSchemaApi.table()`](#databaseschemaapitable) and [`database.alterTable()`](#databasealtertable)'s callback function.

*TableSchemaAPI inherits from [`AbstractSchemaAPI`](#the-abstractschemaapi-api).*

<details><summary>See content</summary>

+ [`tableSchemaApi.name()`](#tableschemaapiname)
+ [`tableSchemaApi.column()`](#tableschemaapicolumn)
+ [`tableSchemaApi.primaryKey()`](#tableschemaapiprimarykey)
+ [`tableSchemaApi.constraint()`](#tableschemaapiconstraint)
+ [`tableSchemaApi.index()`](#tableschemaapiindex)

    *Inherited:*

+ [`abstractSchemaApi.toJson()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

#### `tableSchemaApi.name()`:

<details><summary>
Set or get the table name. <i>(Overrides <code><a href="#abstractschemaapiname">abstractSchemaApi.name()</a></code>.)</i>
<pre><code>tableSchemaApi.name(name?: string | string[]): this</code></pre></summary>

⚙️ Spec:

+ `name` (string | string[], *optional*): when provided, sets the table name. Accepts a two-part array for a fully-qualified table name. When ommitted, gets the table name returned.
+ Return value: `Identifier` - the current table name, or `this` - the `tableSchemaApi` instance.

⚽️ Usage:

Rename the table:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Inspect existing name
    console.log(tableSchemaApi.name().toJson()); // table_1
    // Rename
    tableSchemaApi.name('new_table_1');
}, { description: 'Renaming for testing purposes' });
```

Rename the table - fully-qualified:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.name(['database_1', 'new_table_1']);
}, { description: 'Renaming for testing purposes' });
```

Change the qualifier - moving the table to a different database:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.name(['database_4', 'new_table_1']);
}, { description: 'Renaming for testing purposes' });
```

</details>

#### `tableSchemaApi.column()`:

<details><summary>
Add a column to the table or get an existing one.
<pre><code>tableSchemaApi.column(columnNameOrJson: string | ColumnSchemaSpec): ColumnSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `columnNameOrJson` (string | [`ColumnSchemaSpec`](#schemajson)): when a string, the name of a column to get. When an object, an object that defines a new column to create.
+ Return value: [`ColumnSchemaAPI`](#the-columnschemaapi-api) - the column requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Obtain existing column_1 and modify its type attribute
    tableSchemaApi.column('column_1').type('int');
    // Add column_2
    tableSchemaApi.column({
        name: 'column_2',
        type: ['varchar', 50],
    });
}, { description: 'Altering for testing purposes' });
```

</details>

#### `tableSchemaApi.primaryKey()`:

<details><summary>
Add a Primary Key constraint to the table or get the existing one. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-PRIMARY-KEYS">PRIMARY KEY</a></code> constraint.)</i>
<pre><code>tableSchemaApi.primaryKey(constraintJson?: TablePrimaryKeySchemaSpec): TablePrimaryKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`TablePrimaryKeySchemaSpec`](#schemajson), *optional*): when provided, an object that defines a new Primary Key to create, specifying the intended Primary Key column(s), and optionally, a constraint name. When ommitted, gets the `PRIMARY_KEY` instance on the table returned if exists.
+ Return value: [`TablePrimaryKeySchemaAPI`](#table-constraint-schema-apis) - the existing `PRIMARY_KEY` instance requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // See if there's one set and undo that
    if (!tableSchemaApi.primaryKey()) {
        // Add a Primary Key constraint on columns 2 and 3
        tableSchemaApi.primaryKey({ columns: ['column_2', 'column_3'] });
    }
}, { description: 'Altering for testing purposes' });
```

</details>

#### `tableSchemaApi.constraint()`:

<details><summary>
Add a Primary Key, Foreign Key, Unique Key, or Check constraint to the table or get an existing one. (Provides a unified way to set/get table constraints.)
<pre><code>tableSchemaApi.constraint(constraintNameOrJson: string | TableConstraintSchemaType): TableConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintNameOrJson` (string | [`TableConstraintSchemaType`](#schemajson)): when a string, the name of a constraint to get. When an object, an object that defines a new constraint to create.
+ Return value: [`TableConstraintSchemaAPI`](#table-constraint-schema-apis) - the constraint requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Obtain existing constraint_1 and modify its columns list
    tableSchemaApi.constraint('constraint_1').columns(['id', 'bio']);
    // Add constraint_2
    tableSchemaApi.constraint({
        type: 'PRIMARY_KEY',
        name: 'constraint_2',
        columns: ['id'],
    });
}, { description: 'Altering for testing purposes' });
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Add an anonymous constraint
const constraint = tableSchemaApi.constraint({
    type: 'PRIMARY_KEY',
    columns: ['id'],
});
// Inspect is auto-generated name
console.log(constraint.name()); // auto_name_25kjd
```

</details>

#### `tableSchemaApi.index()`:

<details><summary>
Add a Fulltext or Spartial Index to the table or get an existing one.
<pre><code>tableSchemaApi.index(indexNameOrJson: string | IndexSchemaSpec): IndexSchema</code></pre></summary>

⚙️ Spec:

+ `indexNameOrJson` (string | [`IndexSchemaSpec`](#schemajson)): when a string, the name of an index to get. When an object, an object that defines a new index to create.
+ Return value: [`IndexSchema`](#the-indexschema-api) - the index requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Obtain existing index_1 and modify its columns list
    tableSchemaApi.index('index_1').columns(['id', 'bio']);
    // Add index_2
    tableSchemaApi.index({
        type: 'FULLTEXT',
        name: 'index_2',
        columns: ['id'],
    });
}, { description: 'Altering for testing purposes' });
```

Note that when an index name is ommitted, one is automatically generated for you:

```js
// Add an anonymous index
const index = tableSchemaApi.index({
    type: 'FULLTEXT',
    columns: ['id'],
});
// Inspect is auto-generated name
console.log(index.name()); // auto_name_4gkbc
```

</details>

------------

#### Table Constraint Schema APIs

```ts
type TableConstraintSchemaAPI = TablePrimaryKeySchemaAPI | TableForeignKeySchemaAPI | TableUniqueKeySchemaAPI | TableCheckConstraintSchemaAPI
```

<details><summary>See details</summary>

```ts
interface TablePrimaryKeySchemaAPI extends PrimaryKeySchemaAPI {
    // Set/get the constraint columns
    columns(value?: string[]): Array;
}
```

> *Jump to [`PrimaryKeySchemaAPI`](#column-constraint-schema-apis)*

```ts
interface TableForeignKeySchemaAPI extends ForeignKeySchemaAPI {
    // Set/get the constraint columns
    columns(value?: string[]): Array;
}
```

> *Jump to [`ForeignKeySchemaAPI`](#column-constraint-schema-apis)*

```ts
interface TableUniqueKeySchemaAPI extends UniqueKeySchemaAPI {
    // Set/get the constraint columns
    columns(value?: string[]): Array;
}
```

> *Jump to [`UniqueKeySchemaAPI`](#column-constraint-schema-apis)*

```ts
interface TableCheckConstraintSchemaAPI extends CheckConstraintSchemaAPI {
    // Get the constraint columns
    columns(): Array;
}
```

> *Jump to [`CheckConstraintSchemaAPI`](#column-constraint-schema-apis)*

</details>

------------

### The `ColumnSchemaAPI` API

*ColumnSchemaAPI* is the programmatic interface to `ColumnSchemaSpec` *(in [schema.json](#schemajson))*. This object is obtained via [`tableSchemaApi.column()`](#tableschemaapicolumn).

*ColumnSchemaAPI inherits from [`AbstractSchemaAPI`](#the-abstractschemaapi-api).*

<details><summary>See content</summary>

+ [`columnSchemaApi.type()`](#columnschemaapitype)
+ [`columnSchemaApi.primaryKey()`](#columnschemaapiprimarykey)
+ [`columnSchemaApi.foreignKey()`](#columnschemaapiforeignkey)
+ [`columnSchemaApi.uniqueKey()`](#columnschemaapiuniquekey)
+ [`columnSchemaApi.check()`](#columnschemaapicheck)
+ [`columnSchemaApi.default()`](#columnschemaapidefault)
+ [`columnSchemaApi.expression()`](#columnschemaapiexpression)
+ [`columnSchemaApi.identity()`](#columnschemaapiidentity)
+ [`columnSchemaApi.notNull()`](#columnschemaapinotnull)
+ [`columnSchemaApi.null()`](#columnschemaapinull)
+ [`columnSchemaApi.autoIncrement()`](#columnschemaapiautoincrement)
+ [`columnSchemaApi.onUpdate()`](#columnschemaapionupdate)
+ [`columnSchemaApi.constraint()`](#columnschemaapiconstraint)

    *Inherited:*

+ [`abstractSchemaApi.name()`](#abstractschemaapiname)
+ [`abstractSchemaApi.toJson()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

#### `columnSchemaApi.type()`:

<details><summary>
Set the column type or get the current value.
<pre><code>tableSchemaApi.type(typeJson?: string | string[]): ColumnTypeSchema</code></pre></summary>

⚙️ Spec:

+ `typeJson` (string | string[], *optional*): when provided, sets the column type. Accepts a two-part array for a fully-qualified type. When ommitted, gets the current column type returned.
+ Return value:`ColumnTypeSchema` - the current column type, or `this` - the `columnSchemaApi` instance.

⚽️ Usage:

Obtain a column and change its type:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // New type
    tableSchemaApi.column('column_1').type(['varchar', 255]);
    // Current type as JSON
    console.log(tableSchemaApi.column('column_1').type().toJson()); // ['varchar', 255]
    // Current type as SQL
    console.log(tableSchemaApi.column('column_1').type().toString()); // varchar(255)
}, { description: 'Altering for testing purposes' });
```

</details>

#### `columnSchemaApi.primaryKey()`:

<details><summary>
Designate the column as Primary Key for the table or get the column's current <code>PRIMARY_KEY</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-PRIMARY-KEYS">PRIMARY KEY</a></code> constraint.)</i>
<pre><code>columnSchemaApi.primaryKey(constraintToggleOrJson?: boolean | PrimaryKeySchemaSpec): PrimaryKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggleOrJson` (boolean | [`PrimaryKeySchemaSpec`](#schemajson), *optional*): when a boolean, toggles the designation of the column as Primary Key for the table. When an object, an object that specifies a constraint name. When ommitted, gets the column's `PRIMARY_KEY` instance returned if exists.
+ Return value: [`PrimaryKeySchemaAPI`](#column-constraint-schema-apis) - the existing `PRIMARY_KEY` instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').primaryKey()) {
        // Add a Primary Key constraint on column_1
        tableSchemaApi.column('column_1').primaryKey(true);
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').primaryKey().name()); // auto_name_25kjd
```

</details>

#### `columnSchemaApi.foreignKey()`:

<details><summary>
Add the <code>FOREIGN_KEY</code> constraint type to the column or get the column's current <code>FOREIGN_KEY</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK">FOREIGN KEY</a></code> constraint.)</i>
<pre><code>columnSchemaApi.foreignKey(constraintJson?: ForeignKeySchemaSpec): ForeignKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`ForeignKeySchemaSpec`](#schemajson), *optional*): when provided, an object that defines a new Foreign Key to create, specifying, among other things, the target table and target columns, and optionally, a constraint name. When ommitted, gets the column's `FOREIGN_KEY` instance returned if exists.
+ Return value: [`ForeignKeySchemaAPI`](#column-constraint-schema-apis) - the existing `FOREIGN_KEY` instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').foreignKey()) {
        // Add a Foreign Key constraint on column_1
        tableSchemaApi.column('column_1').foreignKey({
            targetTable: 'table_2',
            targetColumns: ['id'],
            updateRule: 'CASCADE',
        });
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').foreignKey().name()); // auto_name_25kjd
```

</details>

#### `columnSchemaApi.uniqueKey()`:

<details><summary>
Add the <code>UNIQUE_KEY</code> constraint type to the column or get the column's current <code>UNIQUE_KEY</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS">UNIQUE</a></code> constraint.)</i>
<pre><code>columnSchemaApi.uniqueKey(constraintToggleOrJson?: boolean | UniqueKeySchemaSpec): UniqueKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggleOrJson` (boolean | [`UniqueKeySchemaSpec`](#schemajson), *optional*): when a boolean, toggles the existence of the `UNIQUE_KEY` constraint on the column. When an object, an object that defines a new constraint to create, specifying a constraint name. When ommitted, gets the column's `UNIQUE_KEY` instance returned if exists.
+ Return value: [`UniqueKeySchemaAPI`](#column-constraint-schema-apis) - the existing `UNIQUE_KEY` instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').uniqueKey()) {
        // Add a Unique Key constraint on column_1
        tableSchemaApi.column('column_1').uniqueKey(true);
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').uniqueKey().name()); // auto_name_25kjd
```

</details>

#### `columnSchemaApi.check()`:

<details><summary>
Add the <code>CHECK</code> constraint type to the column or get the column's current <code>CHECK</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html">CHECK</a></code> constraint.)</i>
<pre><code>columnSchemaApi.check(constraintJson?: CheckConstaintSpec): CheckConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`CheckConstraintSchemaSpec`](#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression, and, optionally, a constraint name. When ommitted, gets the column's `CHECK` constraint instance returned if exists.
+ Return value: [`CheckConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `CHECK` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').check()) {
        // Add a Check constraint on column_1
        tableSchemaApi.column('column_1').check({ expr: 'column_1 IS NOT NULL' });
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').check().name()); // auto_name_25kjd
```

</details>

#### `columnSchemaApi.default()`:

<details><summary>
Add the <code>DEFAULT</code> constraint type to the column or get the column's current <code>DEFAULT</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-default.html">DEFAULT</a></code> constraint.)</i>
<pre><code>columnSchemaApi.default(constraintJson?: DefaultConstraintSchemaSpec): DefaultConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`DefaultConstraintSchemaSpec`](#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression, and, optionally, a constraint name. When ommitted, gets the column's `DEFAULT` constraint instance returned if exists.
+ Return value: [`DefaultConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `DEFAULT` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').default()) {
        // Add a Default constraint on column_1
        tableSchemaApi.column('column_1').default({ expr: 'now()' });
    }
});
```

</details>

#### `columnSchemaApi.expression()`:

<details><summary>
Add the <code>EXPRESSION</code> constraint type to the column or get the column's current <code>EXPRESSION</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-generated-columns.html">GENERATED COLUMN</a></code> type.)</i>
<pre><code>columnSchemaApi.expression(constraintJson?: ExpressionConstraintSchemaSpec): ExpressionConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`ExpressionConstraintSchemaSpec`](#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression, and, optionally, a constraint name. When ommitted, gets the column's `EXPRESSION` constraint instance returned if exists.
+ Return value: [`ExpressionConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `EXPRESSION` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').expression()) {
        // Add an Expression constraint on column_1
        tableSchemaApi.column('column_1').expression({ expr: 'column_1 * 2', stored: true });
    }
});
```

</details>

#### `columnSchemaApi.identity()`:

<details><summary>
Add the <code>IDENTITY</code> constraint type to the column or get the column's current <code>IDENTITY</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/17/ddl-identity-columns.html">IDENTITY COLUMN</a></code> type.)</i>
<pre><code>columnSchemaApi.identity(constraintToggleOrJson?: boolean | IdentityConstraintSchemaSpec): IdentityConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggleOrJson` (boolean | [`IdentityConstraintSchemaSpec`](#schemajson), *optional*): when boolean, toggles the existence of the `IDENTITY` constraint on the column. When an object, an object that defines a new constraint to create, specifying an `always` rule. When ommitted, gets the column's `IDENTITY` constraint instance returned if exists.
+ Return value: [`IdentityConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `IDENTITY` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').identity()) {
        // Add an Identity constraint on column_1
        tableSchemaApi.column('column_1').identity({ always: false });
    }
});
```

</details>

#### `columnSchemaApi.notNull()`:

<details><summary>
Add the <code>NOT_NULL</code> constraint type to the column or get the column's current <code>NOT_NULL</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-NOT-NULL">NOT NULL</a></code> constraint.)</i>
<pre><code>columnSchemaApi.notNull(constraintToggle?: boolean): NotNullConstraintSchemaAPIBuilder</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` (boolean, *optional*): when provided, toggles the existence of the `NOT_NULL` constraint on the column. When ommitted, gets the column's `NOT_NULL` constraint instance returned if exists.
+ Return value: [`NotNullConstraintSchemaAPIBuilder`](#column-constraint-schema-apis) - the existing `NOT_NULL` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').notNull()) {
        // Add an notNull constraint on column_1
        tableSchemaApi.column('column_1').notNull(true);
    }
});
```

</details>

#### `columnSchemaApi.null()`:

<details><summary>
Add the <code>NULL</code> constraint type to the column or get the column's current <code>NULL</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-NOT-NULL">NULL</a></code> constraint.)</i>
<pre><code>columnSchemaApi.null(constraintToggle?: boolean): NullConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` (boolean, *optional*): when provided, toggles the existence of the `NULL` constraint on the column. When ommitted, gets the column's `NULL` constraint instance returned if exists.
+ Return value: [`NullConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `NULL` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').null()) {
        // Add an null constraint on column_1
        tableSchemaApi.column('column_1').null(true);
    }
});
```

</details>

#### `columnSchemaApi.autoIncrement()`:

<details><summary>
Add the <code>AUTO_INCREMENT</code> constraint type to the column or get the column's current <code>AUTO_INCREMENT</code> constraint instance. <i>(Translates to the MySQL-specific <code><a href="https://dev.mysql.com/doc/refman/8.4/en/example-auto-increment.html">AUTO_INCREMENT</a></code> constraint.)</i>
<pre><code>columnSchemaApi.autoIncrement(constraintToggle?: boolean): AutoIncrementConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` (boolean, *optional*): when provided, toggles the existence of the `AUTO_INCREMENT` constraint on the column. When ommitted, gets the column's `AUTO_INCREMENT` constraint instance returned if exists.
+ Return value: [`AutoIncrementConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `AUTO_INCREMENT` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaAPI => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').autoIncrement()) {
        // Add an autoIncrement constraint on column_1
        tableSchemaApi.column('column_1').autoIncrement(true);
    }
});
```

</details>

#### `columnSchemaApi.onUpdate()`:

<details><summary>
Add the <code>ON_UPDATE</code> clause to the column or get the column's current <code>ON_UPDATE</code> constraint instance. <i>(Translates to the MySQL-specific <code><a href="https://dev.mysql.com/doc/refman/8.4/en/timestamp-initialization.html">ON UPDATE</a></code> clause for timestamp/datetime columns.)</i>
<pre><code>columnSchemaApi.onUpdate(constraintToggle?: OnUpdateClauseSpec): OnUpdateClauseSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` ([`OnUpdateClauseSpec`](#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression. When ommitted, gets the `ON_UPDATE` clause returned if exists.
+ Return value: [`OnUpdateClauseSchemaAPI`](#column-constraint-schema-apis) - the existing `ON_UPDATE` clause on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').onUpdate()) {
        // Add an autoIncrement constraint on column_1
        tableSchemaApi.column('column_1').onUpdate('CURRENT_TIMESTAMP');
    }
});
```

</details>

#### `columnSchemaApi.constraint()`:

<details><summary>
Add a Primary Key, Foreign Key, Unique Key, Check, or other constraint, to the column or get an existing one. (Provides a unified way to set/get column constraints.)
<pre><code>columnSchemaApi.constraint(constraintType: string, constraintToggleOrJson?: boolean | object): ColumnConstraintSchemaAPI</code></pre>
<pre><code>columnSchemaApi.constraint(constraintJson: ColumnConstraintSchemaType): ColumnConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintType` (string): One of `PRIMARY_KEY`, `FOREIGN_KEY`, `UNIQUE_KEY`, `CHECK`, `DEFAULT`, `EXPRESSION`, `NOT_NULL`, `NULL`, `IDENTITY`, `AUTO_INCREMENT`, `ON_UPDATE`. When provided as only argument, gets the existing constraint on the column returned. When in conjucntion with `constraintToggleOrJson`, gets the constraint added to the column.
+ `constraintToggleOrJson` (boolean | ColumnConstraintSchemaType, *optional*): as explained for `constraintToggle`/`constraintJson` in the individual constraint sections above.
+ `constraintJson` (ColumnConstraintSchemaType):  as explained for `constraintJson` in the individual constraint sections above.
+ Return value: [`ColumnConstraintSchemaAPI`](#column-constraint-schema-apis) - the constraint requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    const col1 = tableSchemaApi.column('column_1');
    // See if we already have a PRIMARY_KEY constraint on the column. Create one if not
    if (!col1.constraint('PRIMARY_KEY')) {
        // Add PRIMARY_KEY
        col1.constraint('PRIMARY_KEY', true);
        // Or: col1.constraint({ type: 'PRIMARY_KEY' });
    }
});
```

</details>

------------

#### Column Constraint Schema APIs

```ts
type ColumnConstraintSchemaAPI = PrimaryKeySchemaAPI | ForeignKeySchemaAPI | UniqueKeySchemaAPI | CheckConstraintSchemaAPI | DefaultConstraintSchemaAPI | ExpressionConstraintSchemaAPI | IdentityConstraintSchemaAPI | NotNullConstraintSchemaAPI | NullConstraintSchemaAPI | AutoIncrementConstraintSchemaAPI | OnUpdateClauseSchemaAPI
```

<details><summary>See details</summary>

```ts
interface PrimaryKeySchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface ForeignKeySchemaAPI extends AbstractSchemaAPI {
    // Set/get the target table
    targetTable(value?: string | string[]): Identifier;
    // Set/get the target columns
    targetColumns(value?: string[]): Array;
    // Set/get the match rule
    matchRule(value?: string): string;
    // Set/get the update rule
    updateRule(value?: string | { rule: string, columns: string[] }): string | { rule: string, columns: string[] };
    // Set/get the delete rule
    deleteRule(value?: string | { rule: string, columns: string[] }): string | { rule: string, columns: string[] };
}
```

```ts
interface UniqueKeySchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface CheckConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
}
```

```ts
interface DefaultConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
}
```

```ts
interface ExpressionConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
    // Set/get the "stored" false
    stored(value?: boolean): boolean;
}
```

```ts
interface IdentityConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the "always" rule
    always(value?: boolean): boolean;
}
```

```ts
interface NotNullConstraintSchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface NullConstraintSchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface AutoIncrementConstraintSchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface OnUpdateClauseSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
}
```

> *Jump to [`AbstractSchemaAPI`](#the-abstractschemaapi-api)*

</details>

------------

### The `AbstractSchemaAPI` API

*AbstractSchema* is a base class inheritted by all Schema APIs - e.g. [`DatabaseSchemaAPI`](#the-databaseschemaapi-api), [`TableSchemaAPI`](#the-tableschemaapi-api), [`ColumnSchemaAPI`](#the-columnschemaapi-api).

<details><summary>See content</summary>

+ [`abstractSchemaApi.name()`](#abstractschemaapiname)
+ [`abstractSchemaApi.toJson()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

#### `abstractSchemaApi.name()`:

<details><summary>
Set or get the name the schema instance.
<pre><code>instance.name(value?: string): string | this</code></pre></summary>

⚙️ Spec:

+ `value` (string, *optional*): when provided, the name of the schema instance. When ommitted, returns the current name.
+ Return value: `string` - the current name, or `this` - the schema instance.

⚽️ Usage:

Set or get the name of a [`ColumnSchemaAPI`](#the-columnschemaapi-api) instance:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Get the name
    console.log(tableSchemaApi.column('column_1').name()); // column_1
    // Rename
    tableSchemaApi.column('column_2').name('new_column_2');
});
```

</details>

#### `abstractSchemaApi.toJson()`:

<details><summary>
Render the Schema instance to a JSON object.
<pre><code>instance.toJson(): object</code></pre></summary>

⚙️ Spec:

+ Return value: an object corresponding to the instance's JSON equivalent in [`schema.json`](#schemajson).

⚽️ Usage:

Render a [`TableSchemaAPI`](#the-tableschemaapi-api) to JSON:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_1').primaryKey(true); // Designate existing column "column_1" as primary key
    tableSchemaApi.column('column_2'); // Drop index_2

    // Now inspect what you've done so far
    console.log(tableSchemaApi.toJson());
});
```

</details>

#### `abstractSchemaApi.toString()`:

<details><summary>
Render the Schema instance to SQL.
<pre><code>instance.toString(): string</code></pre></summary>

⚙️ Spec:

+ Return value: an SQL representation of the instance.

⚽️ Usage:

Render a [`TableSchemaAPI`](#the-tableschemaapi-api) to SQL:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_1').primaryKey(true); // Designate existing column "column_1" as primary key
    tableSchemaApi.column('column_2'); // Drop index_2

    // Now inspect what you've done so far
    console.log(tableSchemaApi.toString());
});
```

</details>

#### `abstractSchemaApi.keep()`:

<details><summary>
Specify whether to keep or drop the schema instance, or get the current <i>keep</i> status.
<pre><code>instance.keep(toggle?: boolean): this</code></pre></summary>

⚙️ Spec:

+ `toggle` (boolean, *optional*): when provided, toggles the *keep* status of the schema. When ommitted returns the current *keep* status of the schema.
+ Return value: `boolean` - the current status, or `this` - the schema instance.

⚽️ Usage:

Drop a [`Column`](#the-columnschemaapi-api):

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_2').keep(false);
});
```

</details>

#### `abstractSchemaApi.drop()`:

<details><summary>
Set the schema instance to the <code>keep === false</code> state.
<pre><code>instance.drop(): this</code></pre></summary>

⚙️ Spec:

+ Return value: `this` - the schema instance.

⚽️ Usage:

Drop a [`Column`](#the-columnschemaapi-api):

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_2').drop();
});
```

</details>

------------

## Linked QL CLI

Linked QL migrations are a **small** addition to Linked QL. And it comes ready-to-use, via the `linkedql` command, upon Linked QL's installation. (No extra setup is required.)

### Overview

The `linkedql` command comes as part of your local Linked QL installation and not as a global package, and that means you'll need the `npx` prefix to run the commands below. E.g.

```cmd
npx linkedql migrate
```

On each command, you can use the `--dir` flag to point Linked QL to your "database" directory (where you have your `schema.json` and `driver.js` files), that's if you have chosen a different location other than `./database`:

```cmd
npx linkedql migrate --dir="./src/database-stuff"
```

*(Relative paths will resolve against your current working directory (CWD).)*

To run a command for a specific database out of your list of databases, use the `--db` flag:

```cmd
npx linkedql migrate --db=database_1
```

To turn off prompts and get Linked QL to just take the "sensible-default" action, use the flag `--auto`:

```cmd
npx linkedql migrate --auto
```

### Commands

#### `linkedql migrate`

*Interactively run new migrations.* Linked QL looks through your local schema and compares with your active DB structure to see what's new. It works interactively by default and you're able to preview each SQL query to be run.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql migrate
```

```cmd
npx linkedql migrate --db=database_1
```

Use the `--desc` flag to provide the description for your new changes:

```cmd
npx linkedql migrate --desc="Initial DB creation"
```

Use the flag `--quiet` to turn off SQL previews:

```cmd
npx linkedql migrate --quiet
```

</details>

#### `linkedql rollback`

*Interactively perform a rollback.* Linked QL looks for the next savepoint at each database and initiates a rollback. It works interactively by default and you're able to preview each SQL query to be run.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql rollback
```

```cmd
npx linkedql rollback --db=database_1
```

Use the `--direction` flag to specify either a "backward" rollback (the default) or a "forward" rollback if already at a certain rollback state:

```cmd
npx linkedql rollback --direction=forward
```

Use the flag `--quiet` to turn off SQL previews:

```cmd
npx linkedql migrate --quiet
```

</details>

#### `linkedql leaderboard`

*View the latest savepoint at each database.* Linked QL displays details about the next savepoint at each database.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql leaderboard
```

```cmd
npx linkedql leaderboard --db=database_1
```

Use the flag `--direction` to specify either a "back in time" lookup (the default) or "forward in time" lookup if already at a certain rollback state:

```cmd
npx linkedql leaderboard --direction=forward
```

</details>

#### `linkedql refresh`

*Refresh local schema file.* Linked QL regenerates the schema from current DB structure for each database it has managed; refreshes local copy.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql refresh
```

```cmd
npx linkedql refresh --db=database_1
```

</details>

#### `linkedql forget`

*Permanently erase savepoint histories.* Linked QL deletes the savepoint history of all databases, or a specific database from the `--db` flag. This is irreversible.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql forget
```

```cmd
npx linkedql forget --db=database_1
```

</details>

🐣 *And that's a wrap!*

## Roadmap

+ [ONGOING] Improve support for MySQL.
+ [DONE] Implement support for a `schema.yml` alternative to `schema.json` file.
+ Implement support for IndexedDB.
+ Implement the in-memory database.

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
