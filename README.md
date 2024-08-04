# Linked QL

[![npm version][npm-version-src]][npm-version-href]<!--[![npm downloads][npm-downloads-src]][npm-downloads-href]-->
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

<picture>
  <source media="(max-width: 799px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-gh-mobile.png?raw=true">
  <source media="(min-width: 800px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql4b.png?raw=true">
    <img src="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql4b.png?raw=true" alt="Linked QL Banner" width="100%">
</picture>

<br>
<br>

> **_Save the overhead working with SQL and structured data - from the time and effort spent figuring out relational queries to the labour managing schemas!_** Try a modern, simplistic take on SQL and databases in general!

<div align="center">
    
[Follow](https://x.com/LinkedQL) • [Sponsor](https://github.com/sponsors/ox-harris)

</div>

Linked QL is a database query client that simplfies how you interact with your database and manage your schemas.

<details><summary><i>What does it do at a high level?</i></summary>

💥 Takes the ORM and friends out of the way and let's you just write SQL, but SQL that you will actually enjoy. (Linked QL extends standard SQL with [new syntax sugars](#introducing-magic-paths) that let you write relational queries in less than half the code and without a single JOIN clause in most cases.)

⚡️ Takes the process out of schema management and lets you just *ALTER* away your DB, but in a safety net. (Linked QL extends your DB behind the scenes to [automatically version](#introducing-auto-versioning) each edit you make and have them kept as "savepoints" that you can always rollback to.)

💥 Brings the "schema-as-code" practice to its true meaning and essentially lets you have your entire DB structure go in a single [`schema.json` file](#re-introducing-schema-as-code-with-schemajson) that you edit in-place, as against the "hundreds of migration files" experience. (Linked QL essentially rewrites your "migrations" experience.)

</details>

Linked QL comes as a small library and is usable over your DB of choice - from the server-side Postgres, mariadb and MySQL, to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), and the in-memory plain JSON object!

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

Other APIs are covered right in [The Linked QL API](https://github.com/linked-db/linked-ql/wiki/API) section. You'll find that, in addition to running pure SQL using `client.query()`, you can also programmatically compose queries if you want; an example being the `client.createDatabase()` API for a `CREATE DATABASE` statement.

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

and for when you need to model the different forms of relationships out there (one-to-many, many-to-one, many-to-many), path operators can go in any direction:

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

leaving you with just the right tool for the job in every scenario: the regular JOINS for whatever calls for them; magic paths for whatever wouldn't really benefit from those!

*✨ We think this will make a lot of your tooling and manual work around SQL obsolete and your codebase saner! You essentially get back SQL - and with it, a dose of magic!*

## Introducing Auto-Versioning

⚡️ *Create, Alter, and Drop schemas without needing to worry about versioning.*

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
    description: 'Create users table',
});
```

```js
// As an axample of what you see:
console.log(savepoint.description);   // Create users table
console.log(savepoint.versionTag);    // 1
console.log(savepoint.savepointDate); // 2024-07-17T22:40:56.786Z
// Or to see everything:
console.table(savepoint.toJson());
```

You're able to access the same savepoint on-demand using the [`database.savepoint()`](https://github.com/linked-db/linked-ql/wiki/API#databasesavepoint) API:

```js
const savepoint = await client.database('public').savepoint();
```

Either way, you get a nifty rollback button, should you want to:

```js
// Rollback all associated changes (Gets the users table dropped)
await savepoint.rollback();
```

all the way back to a point in time, should you want to:

```js
// Rollback to public@3
let savepoint;
while((savepoint = await client.database('public').savepoint()) && savepoint.versionTag <= 3) {
    await savepoint.rollback();
}
```

*✨ Now, that's your go-ahead to alter your DB carefree! You've got a safety net!*

Taking that further, you also get a way to *roll forward* from a rollback state! (Much like hitting "Redo" to reverse a certain "Undo").

This time, on calling `database.savepoint()`, you indicate that you want a "forward" movement from your current point in time:

```js
// "Undo" the last rollback (Gets the users table re-created)
let savepoint = await client.database('public').savepoint({ direction: 'forward' });
await savepoint.rollback();
```

You essentially get time travel in any direction - and as seamlessly as you move on a movie track!

_✨ Meanwhile, your schema histories are now being encoded **as data** (**instead of as files**), making them queryable, analyzable, and even visualizable, as regular data! Plus, the DB now essentially becomes the absolute source of truth for both itself and its client applications!_

## Re-Introducing Schema-as-Code with `schema.json`

💥 *Have your entire DB structure live in a single `schema.json` (or `schema.yml`) file that you edit in-place!*

With schema versioning now over to the database, and given the freedom to not need to keep certain schema histories to manually maintain past states (or risk losing them), we found that you could essentially streamline you whole "database" footprint from spanning multiple files to fitting into a single `schema.json` (or `schema.yml`) file!

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

> <details><summary>See a full example</summary>
> 
> ```js
> [
>     {
>         // string - required
>         "name": "database_1",
>         // TableSchemaSpec[]
>         "tables": [
>             {
>                 // string - required
>                 "name": "users",
>                 // ColumnSchemaSpec[] - required
>                 "columns": [
>                     {
>                         // string - required
>                         "name": "id",
>                         // string or array like ["int",3] - required
>                         "type": "int",
>                         // boolean or PrimaryKeySchemaSpec
>                         "primaryKey": true,
>                         // boolean or IdentityConstraintSchemaSpec
>                         "identity": true
>                     },
>                     {
>                         // string - required
>                         "name": "first_name",
>                         // array or string like "varchar" - required
>                         "type": ["varchar", 101]
>                     },
>                     {
>                         // string - required
>                         "name": "last_name",
>                         // array or string like "varchar" - required
>                         "type": ["varchar", 101]
>                     },
>                     {
>                         // string - required
>                         "name": "full_name",
>                         // array or string like "varchar" - required
>                         "type": ["varchar", 101],
>                         // string or ExpressionConstraintSchemaSpec
>                         "expression": "(first_name || ' ' || last_name)"
>                     },
>                     {
>                         // string - required
>                         "name": "email",
>                         // array or string like "varchar" - required
>                         "type": ["varchar", 50],
>                         // boolean or UniqueKeySchemaSpec
>                         "uniqueKey": true,
>                         // boolean
>                         "notNull": true,
>                         // string or CheckConstraintSchemaSpec
>                         "check": "(email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')"
>                     },
>                     {
>                         // string - required
>                         "name": "parent",
>                         // string or array like ["int",3] - required
>                         "type": "int",
>                         // boolean
>                         "notNull": true,
>                         // ForeignKeySchemaSpec
>                         "references": {
>                             // string or string[] like ["database_2", "users"] - required
>                             "targetTable": "users",
>                             // string[] - required
>                             "targetColumns": ["id"],
>                             // string
>                             "matchRull": "full",
>                             // string or object like { rule: "cascade", columns: ["col1"] }
>                             "updateRule": "cascade",
>                             // string or object like { rule: "restrict", columns: ["col1"] }
>                             "deleteRule": "restrict"
>                         }
>                     }
>                 ],
>                 // TableConstraintSchemaType[]
>                 "constraints": [
>                     {
>                         // string - required
>                         "type": "PRIMARY_KEY",
>                         // string[] - required
>                         "columns": ["id_2"],
>                     },
>                     {
>                         // string - required
>                         "type": "FOREIGN_KEY",
>                         // string[] - required
>                         "columns": ["parent_2"],
>                         // string or string[] like ["database_2", "users"] - required
>                         "targetTable": "users",
>                         // string[] - required
>                         "targetColumns": ["id"],
>                         // string
>                         "matchRull": "full",
>                         // string or object like { rule: "cascade", columns: ["col1"] }
>                         "updateRule": "cascade",
>                         // string or object like { rule: "restrict", columns: ["col1"] }
>                         "deleteRule": "restrict"
>                     },
>                     {
>                         // string - required
>                         "type": "UNIQUE_KEY",
>                         // string
>                         "name": "constraint_name",
>                         // string[] - required
>                         "columns": ["parent", "full_name"]
>                     },
>                     {
>                         // string - required
>                         "type": "CHECK",
>                         // string - required
>                         "expr": "(email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')"
>                     }
>                 ],
>                 // IndexSchemaSpec[]
>                 "indexes": [
>                     {
>                         // string - required
>                         "type": "FULLTEXT",
>                         // string[] - required
>                         "columns": ["full_name"]
>                     },
>                     {
>                         // string - required
>                         "type": "SPATIAL",
>                         // string[] - required
>                         "columns": ["full_name"]
>                     }
>                 ]
>             }
>         ]
>     },
>     {
>         // string - required
>         "name": "database_2",
>         // TableSchemaSpec[]
>         "tables": []
>     }
> ]
> ```
> 
> </details>

> <details><summary>See the schema spec</summary>
> 
> ```ts
> interface DatabaseSchemaSpec {
>     name: string;
>     tables: TableSchemaSpec[];
> }
> ```
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
> ```ts
> interface ColumnSchemaSpec {
>     name: string;
>     type: string | array;
>     primaryKey?: boolean | PrimaryKeySchemaSpec;
>     [ foreignKey | references ]?: ForeignKeySchemaSpec;
>     uniqueKey?: boolean | UniqueKeySchemaSpec;
>     check?: string | CheckConstraintSchemaSpec;
>     default?: string | DefaultConstraintSchemaSpec;
>     expression?: string | ExpressionConstraintSchemaSpec;
>     identity: boolean | IdentityConstraintSchemaSpec;
>     onUpdate?: string | OnUpdateConstraintSchemaSpec; // (MySQL-specific attribute)
>     autoIncrement?: boolean; // (MySQL-specific attribute)
>     notNull?: boolean;
>     null?: boolean;
> }
> ```
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
> ```ts
> interface IndexSchemaSpec {
>     name?: string;
>     type: string;
>     columns: string[];
> }
> ```
>
> </details>

If you had that somewhere in your application, say at `./database/schema.json`, Linked QL could help keep it in sync both ways with your database:

+ you add or remove a database object or table object or column object... and it is automatically reflected in your DB structure at the click of a command: `linkedql migrate`
+ your colleague makes new changes from their codebase... and it is automatically reflected in your local copy at your next `git pull`, or at the click of a command: `linkedql refresh`

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

    Now, you can always extend your DB structure with new objects and always drop existsing objects or edit them in-place. But note that for an existing database, table, column, constraint, or index, **names may be changed, but not in-place!** A "rename" operation is done with the addition of a temporary `$name` attribute:

    ```js
    {
        "name": "old_name",
        "$name": "new_name"
    }
    ```

    The old name being in place is needed to find the target during migration. The temporary `$name` attribute automatically disappears after new name has been picked up by Linked QL at next `linkedql migrate`.

To run:

+ Use `linkedql migrate` to walk through your staged local changes and interactively perform a migration against your database.
+ Use `linkedql rollback` to walk through the latest savepoint at each database and interactively perform a rollback.
+ Use `linkedql leaderboard` to just view the latest savepoint at each database.

*(Details of these commands in the [Linked QL CLI](https://github.com/linked-db/linked-ql/wiki/CLI#linked-ql-cli) section.)*

_✨ That's the goodbye to dozens of migration files and its processes! (You may want to see how that brings us to [true "Schema as Code" in practice](#test-heading).)_

🐣 *And that's a wrap on Linked QL!*

## DOCS

If you've made it this far, you may want to go here next:

+ The Linked QL API: [in the wiki](https://github.com/linked-db/linked-ql/wiki/API) ✈️
+ The Linked QL CLI: [in the wiki](https://github.com/linked-db/linked-ql/wiki/CLI) ✈️

## Roadmap

+ [`ONGOING`] Improve support for MySQL.
+ [`DONE`] Implement support for a `schema.yml` alternative to `schema.json` file.
+ [`PENDING`] Implement support for IndexedDB.
+ [`PENDING`] Implement the in-memory database.

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
