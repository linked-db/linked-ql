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

<div align="center">

Not an ORM like Prisma or Drizzle, and yet, not an ordinary database query client!

Here's what we're building:

</div>

</td></td>
<tr><td>
<details _name="features"><summary>A SQL-native experience</summary>

Whereas the typical ORM has hand-written SQL as the exception, Linked QL has it as <ins>the default</ins>, and along with that, it comes with everything that makes it all the more delightful to #usethelanguage!

##### └ *Preview:*

```js
// (1): A basic query with parameters
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
// (2): A basic DDL query
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
<details _name="features"><summary>Powerful syntax sugars</summary>

Model structures and traverse relationships like they were plain JSON objects—all right within the language! Meet Linked QL's set of syntax extensions to SQL that <ins>do the hard work</ins>, <ins>cut your query in half</ins>, and even <ins>save you multiple round trips</ins>! *(See ➞ [JSON Sugars](https://github.com/linked-db/linked-ql/wiki/JSON-Sugars), [Magic Paths](https://github.com/linked-db/linked-ql/wiki/Magic-Paths), [Upserts](https://github.com/linked-db/linked-ql/wiki/UPSERT))*

##### └ *Preview:*

```js
// (1): JSON Sugars
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
// (2): Magic Paths
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
// (3): Upsert
const result = await client.query(
    `UPSERT INTO public.users 
        ( name, email, role )
    VALUES
        ( 'John Doe', 'jd@example.com', 'admin' ),
        ( 'Alice Blue', 'ab@example.com', 'guest' )`
);
console.log(result);
```

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Progressive enhancement</summary>

While the typical ORM often imposes a high level of abstraction where that's not desired, Linked QL offers a <ins>SQL-by-default, progressive enhancement</ins> workflow that lets you think from the ground up! And at whatever part of that spectrum you find a sweet spot, you also get the same powerful set of features that Linked QL has to offer! *(See ➞ [Examples](https://github.com/linked-db/linked-ql/wiki/Examples))*

##### └ *Preview:*

```js
// (a): SQL
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
// (b): Object-Based Query Builder
const result = await client.database('public').table('users').select(
    [ 'name', 'email' ],
    { where: { some: [
        { eq: ['role', { binding: 'admin' }] },
        { eq: ['role', { binding: 'contributor' }] }
    ] } }
);
```

```js
// (c): Function-Based Query Builder
const result = await client.database('public').table('users').select(
    [ 'name', 'email' ],
    { where: (q) => q.some(
        (r) => r.eq('role', (s) => s.binding('admin')),
        (r) => r.eq('role', (s) => s.binding('contributor')),
    ) }
);
```

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Automatic schema inference</summary>

Whereas the typical ORM requires you to feed them with your database schema (case in point: [Drizzle](https://orm.drizzle.team/)), Linked QL <ins>automatically infers it</ins> and magically maintains 100% schema-awareness throughout (without necessarily looking again)! You get a whole class of manual work entirely out of the equation! *(See ➞ [Automatic Schema Inference](https://github.com/linked-db/linked-ql/wiki/Automatic-Schema-Inference))*

##### └ *Preview:*

> (1): Simply <ins>plug</ins> to your database and <ins>play</ins>...

```js
// Import pg and LinkedQl
import pg from 'pg';
import { SQLClient } from '@linked-db/linked-ql/sql';

// Connect to an arbitrary database
const pgClient = new pg.Client({
    connectionString: process.env.SUPABASE_CONNECTION_STRING,
});
await pgClient.connect();

// Use LinkedQl as a wrapper over that
const client = new SQLClient(pgClient, { dialect: 'postgres' });
```

> (2): Query arbitrary structures... without the upfront schema work!

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

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Automatic schema versioning</summary>

The typical database has no concept of versioning, but no problem, Linked QL comes with it to your database, and along with it, a powerful rollback and rollforward system! On each DDL operation you run against your database (`CREATE`, `ALTER`, `DROP`), you get a savepoint automatically created for you and a seamless rollback path you can take anytime! *(See ➞ [Automatic Schema Versioning](https://github.com/linked-db/linked-ql/wiki/Automatic-Schema-Versioning))*

##### └ *Preview:*

> (1): Obtain a reference to a savepoint

```js
// Alter your database and get back a reference to
// a "savepoint" automatically created for you
const savepoint = await client.query(
    `CREATE TABLE public.users (
        id int,
        name varchar
    )`,
    { desc: 'Create users table' }
);
```

```js
// Or obtain said savepoint on-demand
const savepoint = await client.database('public').savepoint();
```

> (2): Inspect savepoint

```js
// Some details
console.log(savepoint.versionTag()); // 1
console.log(savepoint.commitDesc()); // Create users table
console.log(savepoint.commitDate()); // 2024-07-17T22:40:56.786Z
// Everything...
console.log(savepoint.jsonfy());
```

> (3): Roll back savepoint

```js
// SQL preview
console.log(savepoint.restorePreview());
// "DROP TABLE public.users CASCADE"
```

```js
// Execute rollback (drops "users" table)
await savepoint.rollback({
    desc: 'Users table no more necessary'
});
```

</details>
</td></tr>

<tr><td>
<details _name="features"><summary>Diff-based migration</summary>

Whereas schema evolution remains a drag across the board, it comes as a particularly nifty experience in Linked QL! As against the conventional script-based migrations approach, Linked QL follows a diff-based approach that lets you manage your entire DB structure <ins>declaratively</ins> out of a single `schema.json` (or `schema.yml`) file! *(See ➞ [Migration](https://github.com/linked-db/linked-ql/wiki/Migration))*

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

</details>
</td></tr>
<tr><td>

<div align="center">

<br>

And we've got a few things in the radar: extensive TypeScript support (something we love about Prisma); Linked QL Realtime—a realtime data API for offline-first applications.

</div>

</td></tr>
</table>

<br>

<div align="center">•</div>

<br>

<table>
<tr><th>

_Getting Started_
    
</th></tr>
<tr><td>

<div align="center">

Install Linked QL:

<code>npm install @linked-db/linked-ql</code>

</div>

</td></td>
<tr><td>
<details _name="setup"><summary>Postgres / Supabase / Neon / etc</summary>

Install and connect the [`pg`](https://github.com/brianc/node-postgres) client. (Or another postgres client of your choice.) Use Linked QL as a wrapper over that.

```cmd
npm install pg
```

```js
// Import pg and LinkedQl
import pg from 'pg';
import { SQLClient } from '@linked-db/linked-ql/sql';

// Connect pg
const connectionParams = {
    host: 'localhost',
    port: 5432,
};
const pgClient = new pg.Client(connectParams);
await pgClient.connect();
// Use LinkedQl as a wrapper over that
const client = new SQLClient(pgClient, { dialect: 'postgres' });
```

For Supabase/Neon/etc., simply update `connectionParams` to use the *connectionString* for your remote DB:

```js
const connectionParams = { connectionString: process.env.SUPABASE_CONNECTION_STRING };
```

</details>
</td></tr>
<tr><td>
<details _name="setup"><summary>MySQL / mariadb</summary>

Install and connect the [`mariadb`](https://github.com/mariadb-corporation/mariadb-connector-nodejs) client. (Or, where applicable, the [`mysql`](https://www.npmjs.com/package/mysql)/[`mysql2`](https://www.npmjs.com/package/mysql2).) Use Linked QL as a wrapper over that.

```cmd
npm install mariadb
```

```js
// Import mariadb and LinkedQl
import mariadb from 'mariadb';
import { SQLClient } from '@linked-db/linked-ql/sql';

// Connect pg
const myConnection = await mariadb.createConnection({
    host: '127.0.0.1',
    user: 'root',
    port: 3306,
    multipleStatements: true, // Required
    bitOneIsBoolean: true, // The default, but required
    trace: true, // Recommended
});
// Use LinkedQl as a wrapper over that
const client = new SQLClient(myConnection, { dialect: 'mysql' });
```

> **Note that your mariadb database must be `v10.5.2` or higher.** (MySQL `v8` comparably.) In addition, Linked QL needs to be able to run multiple statements in one query. The `multipleStatements` connector parameter above is thus required. We also needed to have the `bitOneIsBoolean` parameter in place.

</details>
</td></tr>
<tr><td>
<details _name="setup"><summary>Indexed DB (Coming soon)</summary>

```js
// Import the IDB Client
import { IDBClient } from '@linked-db/linked-ql/idb';

// Create an instance.
const client = new IDBClient;
```

</details>
</td></tr>
<tr><td>
<details _name="setup"><summary>In-Mem DB (Coming soon)</summary>

```js
// Import the ODB Client
import { ODBClient } from '@linked-db/linked-ql/odb';

// Create an instance.
const client = new ODBClient;
```

</details>
</td></tr>
<tr><td>

<div align="center">

<br>

All `client` instances above implement the same [interface](https://github.com/linked-db/linked-ql/wiki/API)! The primary query interface therein is the [`client.query()`](https://github.com/linked-db/linked-ql/wiki/clientquery) method. For a quick list of examples, see [here](https://github.com/linked-db/linked-ql/wiki/Examples).

</div>

</td></tr>
</table>


<br>
<br>

<div align="center">

[Docs](https://github.com/linked-db/linked-ql/wiki) • [Examples](https://github.com/linked-db/linked-ql/wiki/Examples) • [CLI](https://github.com/linked-db/linked-ql/wiki/CLI) • [API](https://github.com/linked-db/linked-ql/wiki/API) • [Migration](https://github.com/linked-db/linked-ql/wiki/Migration)

---------------------------------

</div>

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
