

<div align="center">

# LinkedQL  
*SQL, evolved.*

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<picture>
  <source media="(max-width:799px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width:800px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" style="table-layout: fixed;">
</picture>

<div align="center">

> ```bash
> npm install @linked-db/linked-ql@next
> ```

**LinkedQL** is a database client that solves the modern database capability problem in a single interface — `client.query()` — and in under `80 KiB min | zip`.

</div>

<div align="center">

| Entry Point | Idea | Capabilities | More |
|:--|:--|:--|:--|
| [Quick Start](#-quick-start) | [What is LinkedQL](#️-what-is-linkedql) | [Language Capabilities](#1--language-capabilities) | [Documentation](#-documentation) |
| [Clients & Dialects](#️-clients--dialects) | [Why LinkedQL](#-why-linkedql) | [Runtime Capabilities](#2--runtime-capabilities) | [Progress](#-development-progress) |
| | | [Offline Capabilities](#3--offline-capabilities) | |

</div>

<br><br>

---

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

LinkedQL ships with native clients for major SQL dialects —
each built as a thin extension of its database’s native driver.

<table style="table-layout: fixed;">
<tr>
<th align="left" width="20%">Dialect</th>
<th align="left">Package</th>
<th align="right" width="25%">Docs</th>
</tr>
<tr><td>PostgreSQL</td><td><code>@linked-db/linked-ql/pg</code></td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#postgresql">Read → PG Docs</a></td></tr>
<tr><td>MySQL</td><td><code>@linked-db/linked-ql/mysql</code></td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#mysql">Read → MySQL Docs</a></td></tr>
<tr><td>MariaDB</td><td><code>@linked-db/linked-ql/mariadb</code></td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#mariadb">Read → MariaDB Docs</a></td></tr>
<tr><td>FlashQL (In-Memory)</td><td><code>@linked-db/linked-ql/flash</code></td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#flashql">Read → FlashQL Docs</a></td></tr>
</table>

---

<br><br>

## 🏗️ What is LinkedQL

LinkedQL is a **modern take on SQL and SQL databases.**

**LinkedQL is a database client that solves the modern database capability problem in a single interface — `client.query()` — and in under `80 KiB min | zip`.**
Same familiar API, but **advanced SQL over your database** — bringing relational queries, live queries, and schema awareness together in one place.

Need SQL locally too? LinkedQL also runs as an **embeddable, in-memory database** — codenamed **FlashQL**.
Use it as a lighter replacement for SQLite or PGLite, with all of LinkedQL’s power built in.

---

## 🧭 Why LinkedQL

SQL and SQL databases have a **capability problem.**
Modern applications built around them have to wade through layers of **external tooling** as a consequence.
(For example, need relational queries and realtime data? → ORMs + GraphQL layers.)

Rather than extend that layer with yet another prosthetic arm for a missing limb in SQL, **LinkedQL extends SQL itself** to close the gaps at their level — **syntax gaps at the language layer**, and **runtime problems at the runtime layer.**

All of that comes built-in with the classic client API — giving your database an **automatic upgrade** in both **language** and **runtime capabilities**.

---

<br><br>

## `1 |` Language Capabilities

LinkedQL extends SQL with optional **syntactic shorthands** — new forms that **compile into standard SQL** for your database.
You write declaratively; LinkedQL handles the translation.

<table style="table-layout: fixed;">
<tr><th align="left">Feature</th><th align="left">Summary</th><th align="right">Docs</th></tr>
<tr><td><b>DeepRefs</b></td><td>Follow relationships using arrow notation (<code>a ~> b ~> c</code>).</td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/DeepRefs">Read →</a></td></tr>
<tr><td><b>JSON Literals</b></td><td>Model JSON shapes directly in SQL using <code>{}</code> and <code>[]</code>.</td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/JSON-Literals">Read →</a></td></tr>
<tr><td><b>UPSERTS</b></td><td>Perform insert-or-update operations with a literal <code>UPSERT</code>.</td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/UPSERTS">Read →</a></td></tr>
</table>

### Examples

<details name="lang-capab" open><summary><b>(a)</b> JSON Modeling</summary>

```js
const result = await client.query(`SELECT { name, email } AS user FROM users;`);
console.log(result.rows);
// → [{ user: { name: 'Jane', email: 'jane@example.com' } }]
```

</details>

<details name="lang-capab"><summary><b>(b)</b> Relationship Traversal</summary>

```js
const posts = await client.query(`SELECT posts.author ~> { id, name } AS author FROM posts;`);
console.log(posts.rows);
// → [{ author: { id: 1, name: 'John Doe' } }]
```

</details>

<details name="lang-capab"><summary><b>(c)</b> Upsert Shortcut</summary>

```js
await client.query(`UPSERT INTO users (name, email) VALUES ('Jane', 'jane@example.com');`);
```

</details>

---

## `2 |` Runtime Capabilities

LinkedQL brings live reactivity and structural versioning to your database —
**without patching it or installing extensions.**

<table style="table-layout: fixed;">
<tr><th align="left">Feature</th><th align="left">Summary</th><th align="right">Docs</th></tr>
<tr><td><b>Realtime Engine</b></td><td>Live queries that continuously self-update as data changes.</td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/RealtimeSQL">Read →</a></td></tr>
<tr><td><b>Timeline Engine</b></td><td>Schema history & rollback — version-bound queries and time-travel introspection.</td><td align="right">(coming soon)</td></tr>
</table>

### Examples

<details name="runtime-capab" open><summary><b>(a)</b> Live Query</summary>

```js
const result = await client.query(
  `SELECT title, author ~> name FROM posts ORDER BY created_at DESC`,
  { live: true }
);
console.log(result.rows); // auto-updates as rows change
```

</details>

<details name="runtime-capab"><summary><b>(b)</b> Version Binding</summary>

```js
const result = await client.query(`SELECT * FROM users@2_3;`);
console.log(result.rows); // Query against schema version 2.3
```

</details>

---

## `3 |` Offline Capabilities

Offline capabilities are powered by **FlashQL** — LinkedQL’s in-memory SQL engine that brings the full database runtime to the client, edge, and offline environments.
It fills another familiar gap: running full SQL locally — and adds built-in support for **federation**, **materialization**, and **sync** between remote databases and local state.

<table style="table-layout: fixed;">
<tr><th align="left">Capability</th><th align="left">Description</th><th align="right">Docs</th></tr>
<tr><td><b>Federation</b></td><td>Query across remote and local databases as a single surface.</td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/FlashQL">Read →</a></td></tr>
<tr><td><b>Materialization</b></td><td>Materialize remote datasets locally for offline queries.</td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/FlashQL">Read →</a></td></tr>
<tr><td><b>Sync</b></td><td>Two-way synchronization between local and remote databases.</td><td align="right"><a href="https://github.com/linked-db/linked-ql/wiki/FlashQL">Read →</a></td></tr>
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
