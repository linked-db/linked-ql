<div align="center">
    
# LinkedQL

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

_A modern take on SQL and SQL databases_

</div>

<picture>
  <source media="(max-width: 799px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width: 800px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
</picture>

<div align="center">

<!--
[⤷ Follow](https://x.com/LinkedQL) • [💖 Sponsor](https://github.com/sponsors/ox-harris)
-->

> ```bash
> npm install @linked-db/linked-ql@next
> ```

LinkedQL is one unified abstraction for your entire database universe — with all the boxes checked for modern apps:

<br>

|  |  |
|:---|:---|
| _Universal SQL_ | [PostgreSQL & MySQL/MariaDB](#11--postgresql--mysqlmariadb) • [FlashQL (in-memory)](#12--flashql) • [Query Federation](#13--query-federation) |
| _Realtime SQL_ | [Live Queries](#21--live-queries) • [Data Sync](#22--data-sync) • [Realtime Triggers](#23--realtime-triggers) |
| _Syntax Niceties_ | [DeepRefs](#31--deeprefs) • [JSON shorthands](#32--json-shorthands) • [UPSERT statement](#33--the-upsert-statement) |
| _Schema Niceties_ | [Automatic versioning](#41--automatic-database-versioning) • [Version binding](#42--version-binding) • [Diff-based migrations](#43--diff-based-migrations) |
| _IDE Niceties_ | [Static error checking](#51--static-error-checking) • [Type safety](#52--type-safety) • [Autocompletion](#53--autocompletion) |

</div>

## 🚀 Quick-start

⤷ _Install and use as a regular database client:_

```shell
npm i @linked-db/linked-ql@next
```

```js
// Import from the relevant namespace
import { PGClient } from '@linked-db/linked-ql/pg';

// Initialize
const client = new PGClient({ host: 'localhost', port: 5432 });
await client.connect();


// Run queries
const result = await client.query(`SELECT 10`);
console.log(result.rows);
```

> [!IMPORTANT]  
> You're viewing **@linked-db/linked-ql@next** — the upcoming iteration.  
> See [@linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql) for the current version (being also the version covered in the [docs](https://github.com/linked-db/linked-ql/wiki)).

## ` 1 |` Universal SQL

⤷ A single abstraction that spans multiple SQL runtimes and application environments — Postgres, MySQL/MariaDB, or FlashQL (in-memory) — with native dialect fidelity.

### `1.1 |` PostgreSQL & MySQL/MariaDB

_Use as a drop-in replacement for `node-postgres` or `mysql2` — same API, richer capabilities._

```js
// Import from the relevant namespace
import { PGClient } from '@linked-db/linked-ql/pg';
import { MySQLClient } from '@linked-db/linked-ql/mysql'; // Or import { MariaDBClient } from '@linked-db/linked-ql/mariadb';

// Initialize and connect
const pg = new PGClient({ host: 'localhost', port: 5432 });
await pg.connect();

const mysql = new MySQLClient({ host: 'localhost', port: 3306 });
await mysql.connect();

// Run standard queries — no DSLs, just SQL
const res1 = await pg.query('SELECT 1::text AS result');
const res2 = await mysql.query('SELECT 1 AS result FROM users');

console.log(res1.rows);
console.log(res2.rows);
```

### `1.2 |` FlashQL

_Run as a pure JavaScript, in-memory SQL engine — embeddable, dual-dialect, and lightweight — ideal for local-first, ephemeral, or browser environments.  
Replaces SQLite or PGLite in many contexts._

```js
// Import from the /flash namespace
import { FlashClient } from '@linked-db/linked-ql/flash';

// Initialize
const client = new FlashClient();
await client.connect();

// Run queries - understands Postgres by default: { dialect: 'postgres' }
await client.query('SELECT 2::text');

// Switch dialect per query
await client.query('SELECT `name` FROM `users`', { dialect: 'mysql' });
```

_Comes pretty robust — supporting advanced language features, including aggregate & window functions, advanced analytics (`GROUPING`, `ROLLUP`, `CUBE`), *set* operations (`UNION`, `INTERSECT`, `EXCEPT`),  Common Table Expressions (CTEs), and more._

```js
const { rows } = await client.query(`
    WITH updated AS (
        UPDATE ${tbl}
        SET val = 'none'
        WHERE id = 999
        RETURNING id, val
    ), sel AS (
        SELECT 
            id, val,
            ROW_NUMBER() OVER () AS rn
        FROM updated
    )
    SELECT * FROM sel
`);
```

> [!NOTE]
> FlashQL runs anywhere JavaScript runs — Node, browser, worker, or edge — and is designed for future pluggable backend (IndexedDB, Redis, etc.).

### `1.3 |` Query Federation

_Query across multiple database systems in one statement — perfect for hybrid setups where data lives across local and remote sources._

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
import { PGClient } from '@linked-db/linked-ql/pg';

const local = new FlashClient({
  remoteClientCallback: async (remoteClientOpts) => {
    const remote1 = new PGClient(remoteClientOpts);
    await remote1.connect();
    return remote1;
  },
});

// federate a Postgres origin under the local namespace "public" (same as remote namespace)
const remoteClientOpts1 = { host: 'localhost', port: 5432 };
await local.federate({ public: ['users', 'orders'] }, remoteClientOpts1);

// federate another origin under the local namespace "pg1" (different from remote namespace)
const remoteClientOpts2 = { connectionString: '...' };
await local.federate(
  {
    pg1: {
      schema: 'public',
      name: 'products',
      where: { status: 1 } // Optional filter
    }
  },
  remoteClientOpts2
);

// Or just write plain SQL if u need more power
await local.federate(
  { pg1: { query: 'SELECT * FROM public.products WHERE status = 1' } },
  remoteClientOpts2
);

// Query seamlessly across local and federated tables
const result = await local.query(`
  SELECT users.id, orders.total, products.name
  FROM public.users
  JOIN public.orders ON users.id = orders.user_id
  JOIN pg1.products ON orders.product_id = products.id
`);
```

> [!TIP]
> LinkedQL automatically routes the relevant parts of your query to their respective origins and streams results back into the working dataset.

> [!NOTE]
> Federation is lazy — data is streamed on demand, not bulk-copied — ideal for hybrid setups where part of your data lives remotely.

## ` 2 |` Realtime SQL

⤷ Built-in reactivity, live data, and sync — without GraphQL servers, middleware, or complex infra.

### `2.1 |` Live Queries

⚡ _Turn on reactivity over arbitrary SQL with `{ live: true }`_

```js
// Turn on reactivity with { live: true }
const result = await client.query(
  `SELECT title, content, users.name AS author FROM books
  LEFT JOIN users ON books.author = users.id`,
  { live: true }
);
```

_Result rows comes as "live" data — continuously self-updating as underlying data changes_

```js
console.log(result.rows); // [{}, {}]
```

_Make changes and see them reflect in the result:_

```js
await client.query(`
  INSERT INTO books (title, content)
  VALUES ('Book 3', 'Content...')`
);
```

```js
setTimeout(() => {
  console.log(result.rows); // [{}, {}, {}]
}, 300);
```

_Stop live mode at any time:_

```js
result.abort();
```

> [!TIP]
> For postgres, ensure you have *Logical Replication* [enabled](https://www.digitalocean.com/community/tutorials/how-to-set-up-logical-replication-with-postgresql-10-on-ubuntu-18-04) on your database. (Coming soon for MySQL; works automatically with FlashQL.)

> [!TIP] 
> "Live" objects like the above can be observed using the [Observer API](https://github.com/webqit/observer):
>
> ```js
> Observer.observe(result.rows, (changes) => console.log(changes));
> ```
>
> Alternatively, you can pass a callback along with your query to manually handle raw changefeeds from the engine:
>
> ```js
> await client.query(`SELECT ...`, (events) => console.log(events), { live: true });
> ```

> [!TIP]
> While LinkedQL fully supports the traditional callback model for manual change handling, its real strength lies in the concept of live result objects — a cleaner, more intuitive way to reason about changing data.
>
> Built for *mutation-based* reactivity, this model integrates seamlessly with newer stacks that share the same foundation, letting you pass dynamic, ever-updating data across your entire application — even over the wire — with zero glue code.
>
> As an example, the Webflo framework would let you return "live" data from a route for automatic binding on the UI — with reactivity preserved through the wire:
>
>  ```js
>  // Return "live" results over the wire from a Webflo route
>  export default async function(event, next) {
>    const result = await client.query(`SELECT ...`, { live: true });
>    return result.rows;
>  }
>  ```

### `2.2 |` Data Sync

🔄 _Two-way data synchronization between local and remote databases — perfect for offline-first, edge-first, and distributed apps._

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
import { PGClient } from '@linked-db/linked-ql/pg';

const local = new FlashClient({
  remoteClientCallback: async (remoteClientOpts) => {
    const remote1 = new PGClient(remoteClientOpts);
    await remote1.connect();
    return remote1;
  },
});

// materialize a Postgres origin under the local namespace "public" (same as remote namespace)
const remoteClientOpts1 = { host: 'localhost', port: 5432 };
await local.materialize({ public: ['users', 'orders'] }, remoteClientOpts1);

// materialize another origin under the local namespace "pg1" (different from remote namespace)
const remoteClientOpts2 = { connectionString: '...' };
await local.materialize(
  {
    pg1: {
      schema: 'public',
      name: 'products',
      where: { status: 1 } // Optional filter
    }
  },
  remoteClientOpts2
);

// Or just write plain SQL if u need more power
await local.materialize(
  { pg1: { query: 'SELECT * FROM public.products WHERE status = 1' } },
  remoteClientOpts2
);
```

_Add `{ live: true }` to materialize in "live" mode._

```js
// Keep it live
await flashql.materialize(
  { public: [{ name: 'orders', where: { user_id: currentUser.id } }] },
  { live: true },
  remoteClientOpts1
);
```

_Need full two-way live sync? Use `.sync()` — it materializes and streams deltas both ways._

```js
// Two-way sync in one shot
await flashql.sync({ public: ['users', 'orders'] }, remoteClientOpts);
```

> [!NOTE]
> Does both materialization (in live mode) and reconciliation with origin — bidirectional, conflict-aware, and resilient to network instabilities. `.sync()` is in _alpha_.

### `2.3 |` Realtime Triggers

⚡ _Listen to row-level or table-level events as they happen — same API across all engines, perfect for e.g. cache invalidation, live analytics, or instant event-driven automation._

```js
// Subscribe to changes on all tables
client.subscribe((event) => {
  console.log(event.type, event.relation.name, event.new);
});
```

```js
// Subscribe to changes on specific tables
client.subscribe({ public: ['users', 'orders'] }, (event) => {
  console.log(event.type, event.relation.name, event.new);
});
```

> [!NOTE]
> 🔔 Each event includes granular metadata — `type` (`insert`/`update`/`delete`), `relation` (schema/table), and `old`/`new` row data.
> Works consistently across FlashQL, Postgres, and MySQL (with logical replication enabled).

## ` 3 |` Syntax Niceties

⤷ Eliminate tons of boilrplate and external tooling with LinkedQL's set of syntax shorthands.

### `3.1 |` DeepRefs

⮑ _Follow relationships using simple arrow notation: `a ~> c ~> d`_

```js
// DeepRefs let you access deeply nested columns
const users = await client.query(
  `SELECT title, content, author ~> name AS author_name FROM books
  WHERE author ~> role = $1`,
  ['admin']
);
```

```js
// DeepRefs can also be written to directly
const users = await client.query(
  `INSERT INTO books
    (title, content, author ~> name)
  VALUES
    ('Book Title 1', 'Hello world... (1)', 'John Doe'),
    ('Book Title 2', 'Hello world... (2)', 'Alice Blue')`
);
```

### `3.2 |` JSON shorthands

🧩 _Model shapes visually using JSON literals: `{}`, `[]`_

```js
// Shape your output data visually
const users = await client.query(
  `SELECT
    u.id, u.first_name, u.last_name,
    { first: u.first_name, last: u.last_name } AS name,
    [ u.email, u.phone ] AS contact
  FROM users AS u`
);
```

```js
console.log(users.rows[0]);
/*
{
  id: 2,
  first_name: 'John',
  last_name: 'Doe',
  name: { first: 'John', last: 'Doe' },
  contact: ['x@x.com', '012345678'],
}
*/
```

### `3.3 |` The UPSERT statement

📦 _Do upserts with a literal UPSERT statement._

```js
// Skip the ON CONFLICT / ON DUPLICATE KEY step
const users = await client.query(
  `UPSERT INTO public.users 
    (name, email, role)
  VALUES
    ('John Doe', 'jd@example.com', 'admin'),
    ('Alice Blue', 'ab@example.com', 'guest')`
);
```

## ` 4 |` Schema Niceties (Coming Soon)

### `4.1 |` Automatic Database Versioning  

<!--⏱ Get automatic database versioning on every DDL operation-->

<!--
// A savepoint is automatically created for you on every DDL operation
const savepoint = await client.query(
  `CREATE TABLE public.users (
    id int,
    name varchar
  )
  RETURNING SAVEPOINT`,
  { desc: 'Create users table' }
);

// Inspect savepoint details
console.log(savepoint.versionTag()); // 1
console.log(savepoint.commitDesc()); // Create users table
console.log(savepoint.commitDate()); // 2024-07-17T22:40:56.786Z

// Rollback at any time (drops the table above)
await savepoint.rollback({ desc: 'Users table no more necessary' });
-->

### `4.2 |` Version Binding  

<!--🧷 Bind queries to specific schema or table versions: <table_ref | schema_ref>@<version_number>-->

<!--
// ...makes this query version-safe
await client.query(
  `SELECT users.first_name, books.title FROM users@3
  LEFT JOIN books@2_1 ON users.id = books.author`
);

// Alter your database without breaking your queries
await client.query(
  `ALTER TABLE users
  RENAME COLUMN first_name TO fname`
);
-->

### `4.3 |` Diff-based Migrations

<!--🤖 Define and evolve schemas declaratively; put migration on autopilot-->


## ` 5 |` IDE Niceties (Coming Soon)

### `5.1 |` Static Error Checking  

<!--🔍 Catch mistakes before they hit production-->

### `5.2 |` Type Safety  

<!--🛡️ Strong types, no guessing-->

### `5.3 |` Autocompletion  

<!--💡 Smarter autocompletion in your editor-->

## ✍️ Documentation

> coming soon

## ⏳ Our progress on this iteration of LinkedQL

| Component              | Status        | Notes                    |
|:-----------------------|:--------------|:-------------------------|
| Core Parser/Compiler   | 🟩🟩🟩🟩 `100%` | Done                  🏆 |
| Core Transform Engine  | 🟩🟩🟩🟩 `100%` | Done                  🏆 |
| InMemory DB Engine     | 🟩🟩🟩🟩 `99%`  | Stable but expanding  🏆 |
| DB Drivers (PG/MySQL)  | 🟩🟩🟩🟩 `97%`  | MySQL catching up     🏆 |
| Realtime Engine        | 🟩🟩🟩🟩 `99%`  | Stable but expanding  🏆 |
| Version Binding        | 🟩⬜⬜⬜ `20%`  | Early prototype          |
| Auto-Versioning Engine | 🟩⬜⬜⬜ `10%`  | Deferring to v0.3.*      |
| Migration Wizard       | 🟩⬜⬜⬜ `10%`  | Deferring to v0.3.*      |
| IDE Tooling            | 🟩⬜⬜⬜ `10%`  | Initial hooks only       |
| Revamped Docs          | ⬜⬜⬜⬜ `0%`   | Not started              |

<!--🟨-->

_Things are moving really fast; and I'm keeping the progress bars here live_

## 🤝 Contributing

LinkedQL is in active development — and contributions are welcome!  

Here’s how you can jump in:  
- **Issues** → Spot a bug or have a feature idea? Open an [issue](https://github.com/linked-db/linked-ql/issues).  
- **Pull requests** → PRs are welcome for fixes, docs, or new ideas.  
- **Discussions** → Not sure where your idea fits? Start a [discussion](https://github.com/linked-db/linked-ql/discussions).  

### 🛠️ Local Setup

⤷ clone → install → test

```bash
git clone https://github.com/linked-db/linked-ql.git
cd linked-ql
git checkout next
npm install
npm test
```

### 📝 Tips

- Development happens on the `next` branch — be sure to switch to it as above after cloning.
- Consider creating your feature branch from `next` before making changes (e.g. `git checkout -b feature/my-idea`).
- Remember to `npm test` before submitting a PR.
- Check the [Progress](#-our-progress-on-this-iteration-of-linkedql) section above to see where help is most needed.

## 🔑 License

MIT — see [LICENSE](https://github.com/linked-db/linked-ql?tab=MIT-1-ov-file)

[npm-version-src]: https://img.shields.io/npm/v/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/@linked-db/linked-ql
[npm-downloads-src]: https://img.shields.io/npm/dm/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/@linked-db/linked-ql
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql@next?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql@next
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/next/LICENSE
