<div align="center">
    
# LinkedQL

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<br>

<picture>
  <source media="(max-width: 799px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width: 800px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
</picture>

<br>

<div align="center">

[👉 Follow](https://x.com/LinkedQL) • [💖 Sponsor](https://github.com/sponsors/ox-harris)

A modern take on SQL and SQL databases that checks all the boxes for modern apps — and essentially gives you a unified abstraction for every use case.

|  |  |
|:---|:---|
| _Universal SQL_ | [PostgreSQL](#11--postgresql) • [MySQL/MariaDB](#12--mysqlmariadb) • [FlashQL (in-memory)](#13--flashql) |
| _Realtime DB_ | [Live Queries](#21--live-queries) • [Write Sync (Offline-first)](#22--write-sync-offline-first) • [Realtime Triggers](#23--realtime-triggers) |
| _Syntax Niceties_ | [DeepRefs](#31--deeprefs) • [JSON shorthands](#32--json-shorthands) • [UPSERT statement](#33--the-upsert-statement) |
| _Schema Niceties_ | [Automatic versioning](#41--automatic-database-versioning) • [Version binding](#42--version-binding) • [Diff-based migrations](#43--diff-based-migrations) |
| _IDE Niceties_ | [Static error checking](#51--static-error-checking) • [Type safety](#52--type-safety) • [Autocompletion](#53--autocompletion) |

</div>

## 🚀 Quick-start

```bash
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
> This is **@linked-db/linked-ql@next** — the upcoming iteration.  
> See [@linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql) for the current stable version (also covered in the [docs](https://github.com/linked-db/linked-ql/wiki)).

## ` 1 |` Universal SQL

### `1.1 |` PostgreSQL

Use as a drop-in replacement for `node-postgres`, but better.

```js
// Import from the /pg namespace
import { PGClient } from '@linked-db/linked-ql/pg';

// Initialize
const client = new PGClient();
await client.connect();

// Run queries
const { rows } = await client.query('SELECT 2::text');
console.log(rows);
```

> PGClient accepts same *init* options as `node-postgres`

### `1.2 |` MySQL/MariaDB

Use as a drop-in replacement for `mysql2`, but better.

```js
// Import from the /mysql namespace
import { MySQLClient } from '@linked-db/linked-ql/mysql';

// Initialize
const client = new MySQLClient();
await client.connect();

// Run queries
const { rows } = await client.query('SELECT 2');
console.log(rows);
```

> MySQLClient accepts same *init* options as `mysql2`

### `1.3 |` FlashQL

Run as a pure JavaScript, in-memory SQL engine — embeddable, dual-dialect, and lightweight.  
Replaces SQLite or PGLite in many contexts.

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

Comes pretty robust — supporting aggregate & window functions, advanced analytics (`GROUPING`, `ROLLUP`, `CUBE`), *set* operations (`UNION`, `INTERSECT`, `EXCEPT`), CTEs (Common Table Expressions), and more.

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

> FlashQL has planned support for a wide range of underlying storage options like IndexedDB, Redis, etc.

## ` 2 |` Realtime DB

### `2.1 |` Live Queries

⚡ _Turn on reactivity on arbitrary SQL with `{ live: true }`_

```js
// Turn on reactivity with { live: true }
const result = await client.query(
  `SELECT title, content, users.name AS author FROM books
  LEFT JOIN users ON books.author = users.id`,
  { live: true }
);
```

_Treat result rows as "live" object:_

```js
console.log(result.rows); // [{}, {}]
```

_Make changes and see them reflected in the result:_

```js
await client.query(`INSERT INTO books (title, content) VALUES ('Book 3', 'Content...')`);
```

```js
console.log(result.rows); // [{}, {}, {}]
```

_Stop live mode at any time:_

```js
result.abort();
```

> [!TIP]
> For postgres, ensure you have *Logical Replication* enabled on your database. (Coming soon for MySQL; works automatically with FlashQL.)

> [!TIP] 
> Watch "live" objects like the above using the [Observer API](https://github.com/webqit/observer):
>
> ```js
> Observer.observe(result.rows, (changes) => console.log(changes));
> ```
>
> Or pass your callback along with query if prefered over the live object mode:
>
> ```js
> await client.query(`SELECT ...`, (events) => console.log(events), { live: true });
> ```

> [!TIP] 
> *Live objects* as default mode comes as a special love letter to newer stacks that understand live objects, letting you pass live data across your entire application stack — even over the wire — with zero boilerplate.
> As an example, the Webflo framework would let you return "live" data from a route for automatic binding on the UI — with reactivity preserved over the wire:
>
>  ```js
>  // Return "live" results over the wire from a Webflo route
>  export default async function(event, next) {
>    const result = await client.query(`SELECT ...`, { live: true });
>    return result.rows;
>  }
>  ```

### `2.2 |` Write Sync (Offline-first)

[_Coming Soon_] Automatic write synchronization for offline-first and distributed apps. (Designed to complement live queries with seamless two-way sync.)


### `2.3 |` Realtime Triggers

[_Coming Soon_] User-defined realtime hooks on database changes — perfect for automation and observability.

## ` 3 |` Syntax Niceties

### `3.1 |` DeepRefs

⮑ Follow relationships using simple arrow notation: `a ~> c ~> d`

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

🧩 Model shapes visually using JSON literals: `{}`, `[]`

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

📦 Do upserts with a literal UPSERT statement.

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

👉 clone → install → test

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
