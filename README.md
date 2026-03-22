<div align="center">

# LinkedQL  

_A modern take on SQL and SQL databases_

[![npm version][npm-version-src]][npm-version-href]
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
[![coverage][coverage-src]][coverage-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<picture>
  <source media="(max-width:799px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width:800px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
</picture>

<div align="center">

<br>

_Simplify and unify your entire database layer in a single interface_ 🛸<br>
LinkedQL is a database client (`client.query()`) for PostgreSQL and MySQL/MariaDB, but more broadly, an idea: **[SQL reimagined for modern apps ↗](https://linked-ql.netlify.app/overview)**.
LinkedQL solves **reactivity, relationships, JSON, schemas, embedding, federation & sync, and more** in under `80 KiB min | zip`.

</div>

---

> [!NOTE]
> You’re viewing **@linked-db/linked-ql** — the newest iteration.  
> For the prev 0.3.x branch, see [linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql/tree/0.30.13).

> [!IMPORTANT]
> 🚀 **LinkedQL is in active development and evolving daily.** Current status = **alpha**.<br>
> You’re welcome to experiment, but it’s not yet suited for production apps.

---

<br>

<div align="center">

| Guide                                     | Explore                                       | Project                           |
|:------------------------------------------|:----------------------------------------------|:----------------------------------|
| [Installation](#installation)             | [Capabilities](#capabilities)                 | [Status](#-status)                |
| [Clients & Dialects](#clients--dialects)  | [Features](#features)                         | [Contributing](#-contributing)    |
| [Query Interface](#query-interface)       | [Documentation](#documentation)               | [License](#-license)              |

</div>

<br>

---

## Installation

LinkedQL is distributed as an npm package. Install it with:

```bash
npm install @linked-db/linked-ql
```

The package provides clients for all supported SQL dialects — including **FlashQL**, the in-memory SQL engine for local or offline use.

## Initialization

Import and initialize the client for your use case. You can run either fully in-memory or with a database.
Here are two quick examples:

### Run Locally with FlashQL

FlashQL lets you run SQL queries entirely in memory — with zero setup.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const client = new FlashQL();

await client.query(`CREATE TABLE users (id INT PRIMARY KEY, name TEXT)`);
const result = await client.query(`
  INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Linus');
  SELECT * FROM users;
`);

console.log(result.rows);
// [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }]
```

FlashQL is ideal for:

* **Local-first and offline-first apps**
* **Running SQL over runtime data**
* **Testing and prototyping**

### Connect to a Database

Connect to your database from the list of supported dialects below.
Here’s an example using PostgreSQL:

```js
import { PGClient } from '@linked-db/linked-ql/postgres';

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
| PostgreSQL          | `@linked-db/linked-ql/postgres`      | [PostgreSQL ↗](https://linked-ql.netlify.app/docs/setup#postgresql) |
| MySQL               | `@linked-db/linked-ql/mysql`   | [MySQL ↗](https://linked-ql.netlify.app/docs/setup#mysql)           |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [MariaDB ↗](https://linked-ql.netlify.app/docs/setup#mariadb)       |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flashql`   | [FlashQL ↗](https://linked-ql.netlify.app/docs/setup#flashql)       |

## Query Interface

LinkedQL maintains a **unified and familiar interface** across all dialects — whether remote or local.
Method signatures and return values are consistent and documented in the
[**Client API Reference ↗**](https://linked-ql.netlify.app/docs/query-api)

---

## Capabilities

| Capability                    | Description                                                                                                                    |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Live Queries**            | Turn on reactivity over any SQL query with `{ live: true }`. No extra infrastructure required.                                   |
| 🔗 **DeepRef Operators**      | Traverse relationships using simple path notation (`~>` / `<~`). Insert or update nested structures using same notation.       |
| 🧩 **JSON Literals**          | Bring JSON-like clearity to your queries with LinkedQL's first-class support for JSON notation.                                |
| 🪄 **Upserts**                | Do upserts with a literal UPSERT statement.                                                                                    |
| 🧠 **Schema Versioning**      | (Coming soon) Get automatic schema versioning on your database: automatic snapshots and historical introspection.              |
| 💾 **Edge & Offline Runtime** | (FlashQL) Run or embed SQL locally — in browsers, workers, or edge devices — for local-first and offline-first applications.   |
| 🌐 **Federation & Sync**      | (Alpha) Unify remote databases, REST endpoints, and local stores into a single relational graph with seamless synchronization. |

## Features

| Feature                                   | Description                                                                                             |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| 💻 **Classic `client.query()` Interface** | Same classic client interface; advanced capabalities for modern applications. |
| 🔗 **Multi-Dialect Support**              | A universal parser that understands PostgreSQL, MySQL, MariaDB, and FlashQL — one client, many dialects.           |
| 💡 **Lightweight Footprint**              | A full reactive data layer in one compact library — under 80 KiB (min/zip). |
| 🎯 **Automatic Schema Inference**         | No upfront schema work. LinkedQL auto-discovers your schema and stays schema-driven across complex tasks.      | 
| 🪄 **Diff-Based Migrations**              | (Coming soon) Evolve schemas declaratively through change detection instead of hand-written migration scripts.        |

## Documentation

Visit the [LinkedQL documentation site ↗](https://linked-ql.netlify.app)

| Jump to |  |
|:--|:--|
| [Getting Started ↗](https://linked-ql.netlify.app/docs) | Get started with LinkedQL in under three minutes. No database required |
| [Capabilities Overview ↗](https://linked-ql.netlify.app/capabilities) | Jump to the Capabilities section. |
| [Meet FlashQL ↗](https://linked-ql.netlify.app/flashql) | Meet FlashQL — LinkedQL's embeddable SQL engine. |
| [Engineering Deep Dive ↗](https://linked-ql.netlify.app/engineering/realtime-engine) | Dig into LinkedQL's engineering in the engineering section. |

---

## ⏳ Status

| Component          | Status    | Note                  |
| :----------------- | :-------- | :-------------------- |
| Parser & Compiler  | 🟩 `100%` | Stabilizing           |
| Transform Engine   | 🟩 `100%` | Stabilizing           |
| Drivers (PG/MySQL) | 🟩 `97%`  | Stabilizing; MySQL nearing parity  |
| FlashQL Engine     | 🟩 `99%`  | Expanding             |
| Realtime Engine    | 🟩 `99%`  | Stabilizing           |
| Timeline Engine    | 🟨 `20%`  | Planned               |
| Migration Wizard   | ⬜ `10%`  | Planned               |
| IDE Tooling        | ⬜ `5%`   | Early hooks           |
| Docs (vNext)       | 🟩 `99%`  | Expanding             |

> <!--💡--> Status Legend:<br>
> 🟩 Complete | 🟨 In Progress | ⬜ Not Started

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
[coverage-src]: https://img.shields.io/coverallsCoverage/github/linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[coverage-href]: https://coveralls.io/github/linked-db/linked-ql
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/master/LICENSE
