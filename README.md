# Linked QL

[![npm version][npm-version-src]][npm-version-href]<!--[![npm downloads][npm-downloads-src]][npm-downloads-href]-->
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href] 

<img src="https://github.com/linked-db/linked-ql/blob/master/linked-ql.png?raw=true" alt="Linked QL Banner" width="100%">

> ❄️ **_Save the overhead working with SQL and structured data - from the time and effort spent figuring out relational queries to the labour managing schemas!_** Try a modern, simplistic take on SQL and databases in general! 

Linked QL is a DB query client that simplfies how you interact with your database and manage your schemas.

💥 Takes the ORM and friends out of the way and let's you just write SQL, but SQL that you will actually enjoy. (Linked QL extends standard SQL with [new syntax sugars](#introducing-magic-paths) that let you write relational queries in less than half the code and without a single JOIN clause in most cases.)

⚡️ Takes the process out of schema management and lets you just *ALTER* away your DB, but in a safety net. (Linked QL extends your DB behind the scenes to [automatically version](#introducing-auto-versioning) each edit you make and have them kept as "savepoints" that you can always rollback to.)

💥 Brings the "schema-as-code" practice to its true meaning and essentially lets you have your entire DB structure go in a single [`schema.json` file](#re-introducing-schema-as-code-with-schemajson) that you edit in-place, as against the "hundreds of migration files" experience. (Linked QL essentially rewrites your "migrations" experience.)

It comes as a small library and is usable over your DB of choice - from the server-side Postgres, mariadb and MySQL, to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), to the plain JSON object!

Jump to sections and features:

+ 🎲 [Getting Started](#getting-started)
+ 🎯 [Magic Paths](#introducing-magic-paths)
+ ⛱ [Auto-Versioning](#introducing-auto-versioning)
+ 🧩 [Schema-as-Code](#re-introducing-schema-as-code-with-schemajson)
+ [The Linked QL API](https://github.com/linked-db/linked-ql/wiki/API) ✈️
+ [The Linked QL CLI](https://github.com/linked-db/linked-ql/wiki/CLI) ✈️

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

Other APIs are covered right in [The Linked QL API](#linked-ql-api) section.

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
>     name?: string;
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

*(More details in the [Linked QL CLI](https://github.com/linked-db/linked-ql/wiki/CLI#linked-ql-cli) section.)*

🐣 *And that's a wrap!*

## DOCS

If you've made it this far, you may want to go here next:

+ The Linked QL API: [in the wiki](https://github.com/linked-db/linked-ql/wiki/API) ✈️
+ The Linked QL CLI: [in the wiki](https://github.com/linked-db/linked-ql/wiki/CLI) ✈️

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
