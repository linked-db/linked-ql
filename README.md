<div align="center">

# LinkedQL  

_A modern take on SQL and SQL databases_

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<picture>
  <source media="(max-width:799px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width:800px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
</picture>

<br><br>

<div align="center">

Try an advanced form of SQL right on your database.<br>
**LinkedQL** is a database client (`client.query()`) that solves the modern database capability problem in a single interface — and in under `80 KiB min | zip`.<br>
Relationships • JSON • Reactivity • Versioning • Offline → **SOLVED**

</div>

<br>

<div align="center">

| Entry Point | Idea | Capabilities | More |
|:--|:--|:--|:--|
| [Quick Start](#-quick-start) | [What is LinkedQL](#️-what-is-linkedql) | [Language Capabilities](#1--language-capabilities) | [Documentation](#-documentation) |
| [Clients & Dialects](#️-clients--dialects) | [Why LinkedQL](#-why-linkedql) | [Runtime Capabilities](#2--runtime-capabilities) | [Progress](#-progress-next) |
| | | [Offline Capabilities](#3--offline-capabilities) | |

</div>

<br><br>


## ⚡ Quick Start

```bash
npm i @linked-db/linked-ql
```

```js
import { PGClient } from '@linked-db/linked-ql/pg';

const client = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'myapp'
});

await client.connect();
const result = await client.query(`SELECT 10 AS value`);
console.log(result.rows); // [{ value: 10 }]
await client.disconnect();
```

> [!NOTE]
> You’re viewing **@linked-db/linked-ql** — the newest iteration.  
> For the prev 0.3.x branch, see [linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql/tree/0.30.13).

---

## 🗄️ Clients & Dialects

LinkedQL ships with clients for each major SQL dialect.<br>
For PostgreSQL, MySQL, and MariaDB, it adapts seamlessly to each database through their respective native connector.

| **Dialect**         | **Package**                    | **Docs**                                                                                   |
| :------------------ | :----------------------------- | :----------------------------------------------------------------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/pg`      | [Read → PG Docs](https://linked-db.github.io/linked-ql/entry/clients#11--postgresql)   |
| MySQL               | `@linked-db/linked-ql/mysql`   | [Read → MySQL Docs](https://linked-db.github.io/linked-ql/entry/clients#12--mysql)     |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [Read → MariaDB Docs](https://linked-db.github.io/linked-ql/entry/clients#13--mariadb) |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flash`   | [Read → FlashQL Docs](https://linked-db.github.io/linked-ql/entry/clients#14--flashql) |

---

<br><br>

## 🏗️ What is LinkedQL

LinkedQL is a database client that solves the modern database capability problem in a single interface.
Same familiar API as a classic client (`client.query()`), but **advanced SQL over your database** — bringing relational queries, live queries, a schema versioning system, offline capabilities and more.

LinkedQL is more **a modern take on SQL and SQL databases** than just a client.

Need the full power of SQL locally? LinkedQL runs as an **embeddable, in-memory database** — codenamed **FlashQL**.
Use it as a lighter replacement for SQLite or PGLite, with all of LinkedQL’s power built in.

---

## 🧭 Why LinkedQL

SQL and SQL databases have a **capability problem.**
Modern applications built around them have to wade through layers of **external tooling** as a consequence.<br>
(For example, need relational queries and realtime data? → typical setup: ORM + GraphQL layers.)

Rather than extend that layer with yet another prosthetic arm for a missing limb in SQL, **LinkedQL extends SQL itself** to close the gaps at their level — **syntax gaps at the language layer**, **runtime problems at the runtime layer.**

All of that comes built-in with the classic client API — giving your database an **automatic upgrade** in both **language** and **runtime capabilities**.

---

<br><br>

## `1 |` Language Capabilities

LinkedQL lets you speak an advanced form of SQL right on your database.
With syntax shorthands and first-class support for relationships and JSON, you skip the imperative parts of SQL and get to writing more **intentful** SQL.
LinkedQL automatically compiles your query down to the SQL your database understands.

| **Feature**       | **Summary**                                                                     | **Docs**                                                                          |
| :---------------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------- |
| **DeepRefs**      | Follow relationships using simple arrow notation (`a ~> b ~> c`).               | [Read → DeepRefs Docs](https://linked-db.github.io/linked-ql/lang/deeprefs)      |
| **JSON Literals** | Model JSON shapes directly in SQL using JSON literals (`{}`, `[]`).             | [Read → JSON Docs](https://linked-db.github.io/linked-ql/lang/json-literals)     |
| **UPSERTS**       | Perform insert-or-update operations with a literal `UPSERT` statement.          | [Read → UPSERTS Docs](https://linked-db.github.io/linked-ql/lang/upsert)        |

### Examples

---

<details open name="lang-capab"><summary><b>(a)</b> JSON Literals — Structured Projection</summary>

> SQL constructs return shaped JSON directly — no post-mapping layer needed.

```js
const result = await client.query(
  `SELECT { id, name, email } AS user
  FROM users
  WHERE id = 1;`
);

console.log(result.rows[0]);
// → { user: { id: 1, name: 'Jane', email: 'jane@example.com' } }
```

</details>

---

<details name="lang-capab"><summary><b>(b)</b> DeepRefs — Inline Relationship Traversal</summary>

> Follow foreign keys directly inside a query — joins expressed as natural relationships.

```js
const posts = await client.query(
  `SELECT title, author ~> { name, email }
  FROM posts
  WHERE published = true;`
);

console.log(posts.rows[0]);
// → { title: 'Syntax Shorthands', author: { name: 'John Doe', email: 'john@example.com' } }
```

</details>

---

<details name="lang-capab"><summary><b>(c)</b> UPSERT — Insert-or-Update in One Step</summary>

> LinkedQL exposes UPSERT as a literal statement — cleaner and portable across dialects.

```js
await client.query(
  `UPSERT INTO users (id, name, email)
  VALUES
    (1, 'Jane', 'jane@example.com'),
    (2, 'James', 'j2@example.com')`
);
```

</details>

---

<br><br>

## `2 |` Runtime Capabilities

LinkedQL enables **SQL-level reactivity** and **automatic schema versioning** right on your database — **no plugins, database extensions, or middleware** required.
(A built-in **Realtime Engine** and **Timeline Engine** quietly extend your database at execution time.)
Modern apps and modern workflows — solved.

| **Feature**         | **Summary**                                                                                         | **Docs**                                                                           |
| :------------------ | :-------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **Realtime SQL**    | Run live, self-updating queries right on your database.                                             | [Read → RealtimeSQL Docs](https://linked-db.github.io/linked-ql/proc/realtime-sql) |
| **Timeline Engine** | Get automatic database versioning on every DDL operation; bind queries to specific schema versions. | *(Coming soon)*                                                                    |

### Examples

---

<details open name="runtime-capab"><summary><b>(a)</b> Live Queries — Continuous Results</summary>

> Turn on reactivity for any query with `{ live: true }` — get a live view of your data.

```js
const result = await client.query(
  `SELECT p.title, p.category, p.views, u.name
  FROM posts AS p LEFT JOIN users AS u ON p.author = u.id
  WHERE p.published = true ORDER BY p.created_at DESC`,
  { live: true }
);

setInterval(() => console.log(result.rows), 1000);
// → Automatically updates as post or author data changes
```

</details>

---

<details name="runtime-capab"><summary><b>(b)</b> Live Queries + Language Shorthands</summary>

> Combine runtime reactivity with language-level extensions — relational traversal, JSON shapes, and more.

```js
const result = await client.query(
  `SELECT
    { title, category, views } AS post,
    author ~> { name, email } AS author
  FROM posts WHERE published = true ORDER BY created_at DESC`,
  { live: true }
);

setInterval(() => console.log(result.rows), 1000);
// → Automatically updates as post or author data changes
```

</details>

---

<details name="runtime-capab"><summary><b>(c)</b> Version Binding — Point-in-Time Queries</summary>

> Anchor a query to a specific schema version — guard against breaking changes with semantic version control.

```js
const result = await client.query(
  `SELECT name, email
  FROM users@2_3
  WHERE active = true;`
);

console.log(result.rows);
// → Runs against schema version 2.3 — unaffected by later migrations
```

</details>

---

<br><br>

## `3 |` Offline Capabilities

LinkedQL can run anywhere your app runs.
Its built-in **FlashQL** runtime brings all of LinkedQL to the **client**, the **edge**, and **offline** environments — same SQL, same semantics.
It extends that with built-in support for **federation**, **materialization**, and **sync** between remote databases and local state.

| **Capability**      | **Summary**                                                  | **Docs**                                                                   |
| :------------------ | :----------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Federation**      | Query across remote and local databases as a single surface. | [Read → FlashQL Docs](https://linked-db.github.io/linked-ql/flash#221-query-federation) |
| **Materialization** | Materialize remote datasets locally for offline queries.     | [Read → FlashQL Docs](https://linked-db.github.io/linked-ql/flash#222-data-materialization) |
| **Sync**            | Two-way synchronization between local and remote databases.  | [Read → FlashQL Docs](https://linked-db.github.io/linked-ql/flash#223-data-sync) |

### Examples

---

<details open name="offline-capab"><summary><b>(a)</b> Local Database — Runs Anywhere</summary>

> The same SQL engine that runs on the server — fully on the client.

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
const client = new FlashClient();

await client.query(`CREATE TABLE users (id SERIAL, name TEXT)`);
await client.query(`INSERT INTO users (name) VALUES ('Alice'), ('Bob')`);

const result = await client.query(`SELECT JSON_AGG(name) AS users FROM users`);

console.log(result.rows);
// → [{ users: ['Alice', 'Bob'] }]
```

</details>

---

<details name="offline-capab"><summary><b>(b)</b> Federation — Local + Remote in One Query</summary>

> Query remote and local tables together — one SQL surface, automatic remote joins.

```js
await client.federate({ store: ['orders'] }, remoteConfig);

const result = await client.query(
  `SELECT
    u.name,
    COUNT(o.id) AS total_orders
  FROM users AS u LEFT JOIN store.orders AS o ON o.user_id = u.id
  GROUP BY u.id
  ORDER BY total_orders DESC`
);

console.log(result.rows);
// → combines local `users` and remote `orders` data transparently
```

</details>

---

<details name="offline-capab"><summary><b>(c)</b> Sync — Continuous Offline Resilience</summary>

> Keep local and remote data automatically aligned — bidirectional, incremental, and resumable.

```js
await client.sync({ store: ['orders'] }, remoteConfig);

const result = await client.query(
  `SELECT
    u.name,
    COUNT(o.id) AS total_orders
  FROM users AS u LEFT JOIN store.orders AS o ON o.user_id = u.id
  GROUP BY u.id ORDER BY total_orders DESC`
);

client.on('sync:status', s => console.log('Sync status:', s.state));
client.on('sync:change', e => console.log('Δ', e.table, e.type));
// → local tables stay mirrored with remote updates — even after reconnects
```

</details>

---

<br><br>

## 📚 Documentation

| Feature           | Description                                                  | Wiki Page                                                                    |
| :---------------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **DeepRefs**      | Declarative relationship traversal across foreign keys.      | [DeepRefs →](https://linked-db.github.io/linked-ql/lang/deeprefs)           |
| **JSON Literals** | Inline JSON modeling syntax — objects, arrays, aggregations. | [JSON Literals →](https://linked-db.github.io/linked-ql/lang/json-literals) |
| **UPSERTS**       | Simplified `INSERT + UPDATE` hybrid statement.               | [UPSERTS →](https://linked-db.github.io/linked-ql/lang/upsert)              |
| **RealtimeSQL**   | Live queries powered by the Realtime Engine.                 | [RealtimeSQL →](https://linked-db.github.io/linked-ql/proc/realtime-sql)    |
| **FlashQL**       | In-memory SQL runtime for offline, edge, and hybrid apps.    | [FlashQL →](https://linked-db.github.io/linked-ql/flash)                    |

---

## ⏳ Progress (`@next`)

| Component          | Status    | Note                  |
| :----------------- | :-------- | :-------------------- |
| Parser & Compiler  | 🟩 `100%` | Stable                |
| Transform Engine   | 🟩 `100%` | Stable                |
| Drivers (PG/MySQL) | 🟩 `97%`  | Complete; MySQL nearing parity  |
| FlashQL Engine     | 🟩 `99%`  | Expanding             |
| Realtime Engine    | 🟩 `99%`  | Expanding             |
| Timeline Engine    | 🟨 `20%`  | Planned               |
| Migration Wizard   | ⬜ `10%`   | Planned              |
| IDE Tooling        | ⬜ `5%`    | Early hooks          |
| Docs (vNext)       | 🟩 `95%`  | Expanding                |

> <!--💡--> Status Legend:<br>
> 🟩 Complete | 🟨 In Progress | ⬜ Not Started

---

<br><br>

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
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/master/LICENSE
