
<div align="center">

# LinkedQL  

_A modern take on SQL and SQL databases_

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<picture>
  <source media="(max-width:799px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width:800px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
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
| [Clients & Dialects](#️-clients--dialects) | [Why LinkedQL](#-why-linkedql) | [Runtime Capabilities](#2--runtime-capabilities) | [Progress](#-development-progress) |
| | | [Offline Capabilities](#3--offline-capabilities) | |

</div>

<br><br>


## ⚡ Quick Start

> [!NOTE]
> You’re viewing **@linked-db/linked-ql@next** — the upcoming iteration.  
> For the stable 0.3.x branch, see [linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql).

```bash
npm i @linked-db/linked-ql@next
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

---

## 🗄️ Clients & Dialects

LinkedQL ships with clients for each major SQL dialect.<br>
For PostgreSQL, MySQL, and MariaDB, it adapts seamlessly to each database through their respective native connector.

<table style="width:100%">
<tr>
<th align="left">Dialect</th>
<th align="left">Package</th>
<th align="left">Docs</th>
</tr>
<tr><td>PostgreSQL</td><td><code>@linked-db/linked-ql/pg</code></td><td align="left"><a href="https://github.com/linked-db/linked-ql/wiki/Entry-Point#11--postgresql">Read → PG Docs</a></td></tr>
<tr><td>MySQL</td><td><code>@linked-db/linked-ql/mysql</code></td><td align="left"><a href="https://github.com/linked-db/linked-ql/wiki/Entry-Point#12--mysql">Read → MySQL Docs</a></td></tr>
<tr><td>MariaDB</td><td><code>@linked-db/linked-ql/mariadb</code></td><td align="left"><a href="https://github.com/linked-db/linked-ql/wiki/Entry-Point#13--mariadb">Read → MariaDB Docs</a></td></tr>
<tr><td>FlashQL (In-Memory)</td><td><code>@linked-db/linked-ql/flash</code></td><td align="left"><a href="https://github.com/linked-db/linked-ql/wiki/Entry-Point#14--flashql">Read → FlashQL Docs</a></td></tr>
</table>

---

<br><br>

## 🏗️ What is LinkedQL

LinkedQL is a database client that solves the modern database capability problem in a single interface.
Same familiar API as a classic client (`client.query()`), but **advanced SQL over your database** — bringing relational queries, live queries, a schema versioning system, and more.<br>

LinkedQL is more **a modern take on SQL and SQL databases** than just a client.

Need the full power of SQL locally? LinkedQL also runs as an **embeddable, in-memory database** — codenamed **FlashQL**.
Use it as a lighter replacement for SQLite or PGLite, with all of LinkedQL’s power built in.

---

## 🧭 Why LinkedQL

SQL and SQL databases have a **capability problem.**
Modern applications built around them have to wade through layers of **external tooling** as a consequence.
(For example, need relational queries and realtime data? → ORMs + GraphQL layers.)

Rather than extend that layer with yet another prosthetic arm for a missing limb in SQL, **LinkedQL extends SQL itself** to close the gaps at their level — **syntax gaps at the language layer**, **runtime problems at the runtime layer.**

All of that comes built-in with the classic client API — giving your database an **automatic upgrade** in both **language** and **runtime capabilities**.

---

<br><br>

## `1 |` Language Capabilities

LinkedQL lets you speak an advanced form of SQL right on your database.<br>
With shorthands and first-class support for relationships and JSON, you skip the imperative parts of SQL and get to writing more **intentful** SQL.<br>
LinkedQL automatically compiles your query down to the SQL your database understands.

| **Feature**       | **Summary**                                                                     | **Docs**                                                                          |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **DeepRefs**      | Follow relationships using simple arrow notation (`a ~> b ~> c`).               | [Read → DeepRefs](https://github.com/linked-db/linked-ql/wiki/DeepRefs)           |
| **JSON Literals** | Model JSON shapes directly in SQL using JSON literals (`{}`, `[]`).             | [Read → JSON Literals](https://github.com/linked-db/linked-ql/wiki/JSON-Literals) |
| **UPSERTS**       | Perform insert-or-update operations with a literal `UPSERT` statement.          | [Read → UPSERTS](https://github.com/linked-db/linked-ql/wiki/UPSERTS)             |

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
// → { title: 'Realtime SQL', author: { name: 'John Doe', email: 'john@example.com' } }
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

LinkedQL enables **SQL-level reactivity** and **automatic schema versioning** right on your database — **with no plugins, or database extensions, or middleware** required.<br>
A built-in **Realtime Engine** and **Timeline Engine** quietly expand what your database can do at execution time.<br>
Designed for modern applications that demand reactivity and consistency — without the stack complexity.

| **Feature**         | **Summary**                                                                                         | **Docs**                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Realtime SQL**    | Run live, self-updating queries over your datatabase.                                               | [Read → RealtimeSQL Docs](https://github.com/linked-db/linked-ql/wiki/RealtimeSQL) |
| **Timeline Engine** | Get automatic database versioning on every DDL operation; bind queries to specific schema versions. | *(Coming soon)*                                                                    |

### Examples

---

<details open name="runtime-capab"><summary><b>(a)</b> Live Queries — Continuous Results</summary>

> Turn on reactivity over arbitrary queries with `{ live: true }`; you get a **live view** of your data.

```js
const result = await client.query(
  `SELECT p.title, p.category, p.views, u.name
  FROM posts AS p LEFT JOIN users AS u ON p.author = u.id
  WHERE p.published = true ORDER BY p.created_at DESC`,
  { live: true }
);

setInterval(() => console.log(result.rows), 1000);
// → auto-updates as posts are created, edited, or deleted
```

</details>

---

<details name="runtime-capab"><summary><b>(b)</b> Live Queries + Syntax Shorthands</summary>

> .

```js
const result = await client.query(
  `SELECT
    { title, category, views } AS post,
    author ~> { name, email } AS author
  FROM posts WHERE published = true ORDER BY created_at DESC`,
  { live: true }
);

setInterval(() => console.log(result.rows), 1000);
// → auto-updates as posts are created, edited, or deleted
```

</details>

---

<details name="runtime-capab"><summary><b>(c)</b> Version Binding — Ponit-in-Time Queries</summary>

> Anchor a query to a specific schema version — prevent breaking changes with semantic version control.

```js
const result = await client.query(
  `SELECT name, email
  FROM users@2_3
  WHERE active = true;`
);

console.log(result.rows);
// → Runs against schema version 2.3 — unaffected by later changes
```

</details>

---

<br><br>

## `3 |` Offline Capabilities

Offline capabilities are powered by **FlashQL** — LinkedQL’s in-memory SQL engine that brings the full database runtime to the client, edge, and offline environments.
It fills another familiar gap: running full SQL locally — and adds built-in support for **federation**, **materialization**, and **sync** between remote databases and local state.

<table style="width:100%">
<tr><th align="left">Capability</th><th align="left">Description</th><th align="left">Docs</th></tr>
<tr><td><b>Federation</b></td><td>Query across remote and local databases as a single surface.</td><td align="left"><a href="https://github.com/linked-db/linked-ql/wiki/FlashQL">Read →</a></td></tr>
<tr><td><b>Materialization</b></td><td>Materialize remote datasets locally for offline queries.</td><td align="left"><a href="https://github.com/linked-db/linked-ql/wiki/FlashQL">Read →</a></td></tr>
<tr><td><b>Sync</b></td><td>Two-way synchronization between local and remote databases.</td><td align="left"><a href="https://github.com/linked-db/linked-ql/wiki/FlashQL">Read →</a></td></tr>
</table>

### Examples

<details name="offline-capab" open><summary><b>(a)</b> Basic Query</summary>

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
const client = new FlashClient();
await client.query(`CREATE TABLE users (id SERIAL, name TEXT)`);
await client.query(`INSERT INTO users (name) VALUES ('Alice'), ('Bob')`);
const res = await client.query(`SELECT JSON_AGG(name) AS users FROM users`);
console.log(res.rows);
// → [{ users: ['Alice', 'Bob'] }]
```

</details>

<details name="offline-capab"><summary><b>(b)</b> Federation Example</summary>

```js
await client.federate({ public: ['users', 'orders'] }, remoteConfig);
const res = await client.query(`SELECT * FROM public.users`);
```

</details>

<details name="offline-capab"><summary><b>(c)</b> Sync Example</summary>

```js
await client.sync({ public: ['users'] }, remoteConfig);
```

</details>

---

<br><br>

## 📚 Documentation

> [!NOTE]
> The main [linked-db/linked-ql/wiki](https://github.com/linked-db/linked-ql/wiki) documents **v0.3.x**.
> Pages tagged **@next** reflect this version.

| Feature           | Description                                                  | Wiki Page                                                                    |
| :---------------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **DeepRefs**      | Declarative relationship traversal across foreign keys.      | [DeepRefs →](https://github.com/linked-db/linked-ql/wiki/DeepRefs)           |
| **JSON Literals** | Inline JSON modeling syntax — objects, arrays, aggregations. | [JSON Literals →](https://github.com/linked-db/linked-ql/wiki/JSON-Literals) |
| **UPSERTS**       | Simplified `INSERT + UPDATE` hybrid statement.               | [UPSERTS →](https://github.com/linked-db/linked-ql/wiki/UPSERTS)             |
| **RealtimeSQL**   | Live queries powered by the Realtime Engine.                 | [RealtimeSQL →](https://github.com/linked-db/linked-ql/wiki/RealtimeSQL)     |
| **FlashQL**       | In-memory SQL runtime for offline, edge, and hybrid apps.    | [FlashQL →](https://github.com/linked-db/linked-ql/wiki/FlashQL)             |

---

## ⏳ Development Progress

| Component          | Status    | Note                  |
| :----------------- | :-------- | :-------------------- |
| Parser & Compiler  | 🟩 `100%` | Stable                |
| Transform Engine   | 🟩 `100%` | Stable                |
| FlashQL Engine     | 🟩 `99%`  | Production-ready      |
| Realtime Engine    | 🟩 `99%`  | Expanding             |
| Drivers (PG/MySQL) | 🟩 `97%`  | MySQL parity nearing  |
| Timeline Engine    | 🟨 `20%`  | Versioning + rollback |
| Migration Wizard   | ⬜ `10%`   | Planned               |
| IDE Tooling        | ⬜ `5%`    | Early hooks           |
| Docs (vNext)       | 🟩 `95%`  | Active                |

> 💡 Status Legend: 🟩 Complete | 🟨 In Progress | ⬜ Not Started

---

<br><br>

## 🤝 Contributing

LinkedQL is in active development — contributions are welcome!

```bash
git clone https://github.com/linked-db/linked-ql.git
cd linked-ql
git checkout next
npm install
npm test
```

* Development happens on the **`next`** branch.
* Open [issues](https://github.com/linked-db/linked-ql/issues) or [discussions](https://github.com/linked-db/linked-ql/discussions).
* Pull requests for fixes, docs, or new ideas are appreciated.

---

## 🔑 License

MIT — see [LICENSE](https://github.com/linked-db/linked-ql/blob/next/LICENSE)

[npm-version-src]: https://img.shields.io/npm/v/@linked-db/linked-ql?style=flat&

[npm-version-src]: https://img.shields.io/npm/v/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/@linked-db/linked-ql
[npm-downloads-src]: https://img.shields.io/npm/dm/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/@linked-db/linked-ql
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql@next?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql@next
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/next/LICENSE
