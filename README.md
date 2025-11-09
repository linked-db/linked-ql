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
Relationships • JSON • Schema • Reactivity • Versioning • Offline → **SOLVED**

</div>

<br>

<div align="center">

| Entry Point | Capabilities | More |
|:--|:--|:--|
| [Quick Start](#quick-start) | [Language Capabilities](#1--language-capabilities) | [What is LinkedQL](https://linked-ql.netlify.app/docs/about) |
| [Clients & Dialects](#clients--dialects) | [Runtime Capabilities](#2--runtime-capabilities) | [Documentation](#-documentation) |
| [Query Interface](#query-interface) | [Offline Capabilities](#3--offline-capabilities) | [Progress](#-progress-next) |

</div>

<br><br>


## Quick Start


### Installation

LinkedQL is distributed as an npm package. Install it with:

```bash
npm install @linked-db/linked-ql
```

The package provides clients for all supported SQL dialects — including **FlashQL**, the in-memory SQL engine for local or offline use.

### Initialization

Import and initialize the client for your use case. You can run either fully in-memory or with a database.
Here are two quick examples:

#### Run Locally with FlashQL

FlashQL lets you run SQL queries entirely in memory — with zero setup.

```js
import { FlashClient } from '@linked-db/linked-ql/flash';

const client = new FlashClient();

const result = await client.query(`
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
  INSERT INTO users (name) VALUES ('Ada'), ('Linus');
  SELECT * FROM users;
`);

console.log(result.rows);
// [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }]
```

FlashQL is ideal for:

* **Local-first and offline-first apps**
* **Running SQL over runtime data**
* **Testing and prototyping**

#### Connect to a Database

Connect to your database from the list of supported dialects below.
Here’s an example using PostgreSQL:

```js
import { PGClient } from '@linked-db/linked-ql/pg';

const client = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await client.connect();

const result = await client.query(`SELECT 10 AS value`);
console.log(result.rows); // [{ value: 10 }]

await client.disconnect();
```

## Clients & Dialects

| **Dialect**         | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/pg`      | [PostgreSQL →](https://linked-ql.netlify.app/docs/setup#postgresql) |
| MySQL               | `@linked-db/linked-ql/mysql`   | [MySQL →](https://linked-ql.netlify.app/docs/setup#mysql)           |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [MariaDB →](https://linked-ql.netlify.app/docs/setup#mariadb)       |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flash`   | [FlashQL →](https://linked-ql.netlify.app/docs/setup#flashql)       |

## Query Interface

LinkedQL maintains a **unified and familiar interface** across all dialects — whether remote or local.
Method signatures and return values are consistent and documented in the
[**Client API Reference →**](https://linked-ql.netlify.app/docs/query-api)

---

> [!NOTE]
> You’re viewing **@linked-db/linked-ql** — the newest iteration.  
> For the prev 0.3.x branch, see [linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql/tree/0.30.13).

> [!IMPORTANT]
> 🚀 **LinkedQL is in active development and evolving daily.** Current status = **alpha**.<br>
> You’re welcome to experiment, but it’s not yet suited for production workloads.

<br><br>

## `1 |` Language Capabilities

| **Feature**       | **Summary**                                                            | **Docs**                                             |
| :---------------- | :--------------------------------------------------------------------- | :--------------------------------------------------- |
| **DeepRefs**      | Follow foreign key relationships directly in simple arrow notation.    | [Read → DeepRefs Docs](https://linked-ql.netlify.app/docs/capabilities/deeprefs)  |
| **JSON Literals** | Model JSON objects and arrays using literal JSON syntax.                         | [Read → JSON Docs](https://linked-ql.netlify.app/docs/capabilities/json-literals) |
| **UPSERT**        | Perform the classic `INSERT...ON CONFLICT` statement in a single step. | [Read → UPSERT Docs](https://linked-ql.netlify.app/docs/capabilities/upsert)      |

### Examples

---

<details open name="lang-capab"><summary><b>(a)</b> JSON Literals — Structured Projection</summary>

> Model JSON objects and arrays using literal JSON syntax.

```js
const result = await client.query(`
  SELECT
  id,
  { first: first_name, last: last_name } AS name,
  { email, phone: phone_number } AS contact
  FROM users
`);

console.log(result.rows[0]);
// { id: 1, name: { first: 'Jane', last: 'Dark' }, contact: { email: 'jane@example.com', phone: null } }
```

</details>

---

<details name="lang-capab"><summary><b>(b)</b> DeepRefs — Relationship Traversal</summary>

> Follow foreign key relationships directly in simple arrow notation.

```js
const posts = await client.query(`
  SELECT title, author ~> { name, email }
  FROM posts
  WHERE published = true;
`);

console.log(posts.rows[0]);
// { title: 'Syntax Shorthands', author: { name: 'John', email: 'john@example.com' } }
```

</details>

---

<details name="lang-capab"><summary><b>(c)</b> UPSERT — Insert or Update</summary>

> Perform the classic `INSERT...ON CONFLICT` statement in a single step.

```js
await client.query(`
  UPSERT INTO users (id, name, email)
  VALUES
    (1, 'Jane', 'jane@example.com'),
    (2, 'James', 'j2@example.com');
`);
```

</details>

---

<br><br>

## `2 |` Runtime Capabilities

| **Feature**         | **Summary**                                                            | **Docs**                                                   |
| :------------------ | :--------------------------------------------------------------------- | :--------------------------------------------------------- |
| **Live Queries**    | Turn on reactivity over any query and get back a live view of your data. | [Read → RealtimeSQL Docs](https://linked-ql.netlify.app/docs/capabilities/realtime-sql) |
| **Timeline Engine** | Anchor a query to a fixed schema version for stable results over time. | *(Coming soon)*                                            |

### Examples

---

<details open name="runtime-capab"><summary><b>(a)</b> Live Queries and Live Views</summary>

> Turn on reactivity over any query and get back a live view of your data.

```js
const result = await client.query(`
  SELECT p.title, u.name
  FROM posts AS p LEFT JOIN users AS u ON p.author = u.id
  WHERE p.published = true
  ORDER BY p.created_at DESC
`, { live: true });

setInterval(() => console.log(result.rows), 1000);
// Updates automatically as post or author data changes
```

</details>

---

<details name="runtime-capab"><summary><b>(b)</b> Live Queries + DeepRefs</summary>

> Combine live results with relational traversal and JSON shaping.

```js
const result = await client.query(`
  SELECT
    { title, category } AS post,
    author ~> { name, email } AS author
  FROM posts WHERE published = true
`, { live: true });
```

</details>

---

<details name="runtime-capab"><summary><b>(c)</b> Version Binding — Point-in-Time Queries</summary>

> Anchor a query to a fixed schema version for stable results over time.

```js
const result = await client.query(`
  SELECT name, email
  FROM users@2_3
  WHERE active = true;
`);
```

</details>

---

<br><br>

## `3 |` Offline Capabilities

LinkedQL bundles an embeddable SQL engine, **FlashQL**, that brings its full capabilities to the local runtime, the edge, and offline world.

| **Capability**     | **Summary**                                                   | **Docs**                             |
| :----------------- | :------------------------------------------------------------ | :----------------------------------- |
| **Local Database** | Run a full SQL engine in memory — same semantics, zero setup. | [Read → FlashQL Docs](https://linked-ql.netlify.app/docs/flashql) |
| **Federation**     | Query local and remote data together in a single SQL surface. | [Read → FlashQL Docs](https://linked-ql.netlify.app/docs/flashql) |
| **Sync**           | Keep local and remote tables automatically synchronized.      | [Read → FlashQL Docs](https://linked-ql.netlify.app/docs/flashql) |

### Examples

---

<details open name="offline-capab"><summary><b>(a)</b> Local Database — Runs Anywhere</summary>

> Run a full SQL engine in memory — same semantics, zero setup.

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
const client = new FlashClient();

await client.query(`CREATE TABLE users (id SERIAL, name TEXT)`);
await client.query(`INSERT INTO users (name) VALUES ('Alice'), ('Bob')`);

const result = await client.query(`SELECT JSON_AGG(name) AS users FROM users`);
console.log(result.rows);
// [{ users: ['Alice', 'Bob'] }]
```

</details>

---

<details name="offline-capab"><summary><b>(b)</b> Federation — Local + Remote</summary>

> Query local and remote data together in a single SQL surface.

```js
await client.federate({ store: ['orders'] }, remoteConfig);

const result = await client.query(`
  SELECT u.name, COUNT(o.id) AS total_orders
  FROM users AS u LEFT JOIN store.orders AS o ON o.user_id = u.id
  GROUP BY u.id ORDER BY total_orders DESC;
`);
```

</details>

---

<details name="offline-capab"><summary><b>(c)</b> Sync — Continuous Alignment</summary>

> Keep local and remote tables automatically synchronized.

```js
await client.sync({ store: ['orders'] }, remoteConfig);

client.on('sync:status', s => console.log('Sync status:', s.state));
client.on('sync:change', e => console.log('Δ', e.table, e.type));
```

</details>

---

<br><br>

## 📚 Documentation

| Feature           | Description                                                  | Wiki Page                                                                    |
| :---------------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **DeepRefs**      | Declarative relationship traversal across foreign keys.      | [DeepRefs →](https://linked-ql.netlify.app/docs/capabilities/deeprefs)           |
| **JSON Literals** | Inline JSON modeling syntax — objects, arrays, aggregations. | [JSON Literals →](https://linked-ql.netlify.app/docs/capabilities/json-literals) |
| **UPSERTS**       | Simplified `INSERT + UPDATE` hybrid statement.               | [UPSERTS →](https://linked-ql.netlify.app/docs/capabilities/upsert)              |
| **RealtimeSQL**   | Live queries powered by the Realtime Engine.                 | [RealtimeSQL →](https://linked-ql.netlify.app/docs/capabilities/realtime-sql)    |
| **FlashQL**       | In-memory SQL runtime for offline, edge, and hybrid apps.    | [FlashQL →](https://linked-ql.netlify.app/docs/flashql)                    |

---

<br><br>

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
