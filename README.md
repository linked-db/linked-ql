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
  <img src="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
</picture>

<div align="center">

> ```bash
> npm install @linked-db/linked-ql@next
> ```

**LinkedQL** is a database client that solves the modern database capability problem in a single interface — `client.query()` — and in under `80 KiB min | zip`

</div>

<div align="center">

| | About | Capabilities | |
|:--|:--|:--|:--|
| [Quick-Start](#-quick-start) | [What is LinkedQL](#️-what-is-linkedql) | [Language Capabilities](#1--language-capabilities) | [Documentation](#-documentation) |
| [Clients & Dialects](#️-clients--dialects) | [Why LinkedQL](#-why-linkedql) | [Runtime Capabilities](#2--runtime-capabilities) | [Progress](#-development-progress) |
| | | [Offline Capabilities](#3--offline-capabilities) | |

</div>

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


## 🗄️ Clients & Dialects

LinkedQL ships with native clients for all major SQL dialects — each built as a thin extension of the database’s own driver.

| Dialect             | Package                        | Docs                                                                                            |
| :------------------ | :----------------------------- | :---------------------------------------------------------------------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/pg`      | [Read → PG Docs](https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#postgresql)   |
| MySQL               | `@linked-db/linked-ql/mysql`   | [Read → MySQL Docs](https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#mysql)     |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [Read → MariaDB Docs](https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#mariadb) |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flash`   | [Read → FlashQL Docs](https://github.com/linked-db/linked-ql/wiki/Clients-and-Dialects#flashql) |

---

<!----->

## 🏗️ What is LinkedQL

**LinkedQL is a database client that solves the modern database capability problem in a single interface — `client.query()` — and in under `80 KiB min | zip`.**
Same familiar API, but **advanced SQL over your database** — bringing relational queries, live queries, and schema awareness together in one place.

Need SQL locally too? LinkedQL also runs as an **embeddable, in-memory database** — codenamed **FlashQL**.
Use it as a lighter replacement for SQLite or PGLite, with all of LinkedQL’s power built in.



## 🧭 Why LinkedQL

SQL and SQL databases have a **capability problem.**
Modern applications built around them have to wade through layers of **external tooling** as a consequence.
(For example, need relational queries and realtime data? → ORMs + GraphQL layers.)

Rather than extend that layer with yet another prosthetic arm for a missing limb in SQL, **LinkedQL extends SQL itself** to close the gaps at their level — **syntax gaps at the language layer**, and **runtime problems at the runtime layer.**

All of that comes built-in with the classic client API — giving your database an **automatic upgrade** in both **language** and **runtime capabilities**.

---

## `1 |` Language Capabilities

LinkedQL extends SQL with optional **syntactic shorthands** — new forms that **compile into standard SQL** for your database.
You write declaratively; LinkedQL handles the translation.

| Feature           | Summary                                                      | Docs                                                                              |
| :---------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| **DeepRefs**      | Follow relationships using arrow notation (`a ~> b ~> c`).   | [Read → DeepRefs](https://github.com/linked-db/linked-ql/wiki/DeepRefs)           |
| **JSON Literals** | Model JSON shapes directly in SQL using `{}` and `[]`.       | [Read → JSON Literals](https://github.com/linked-db/linked-ql/wiki/JSON-Literals) |
| **UPSERTS**       | Perform insert-or-update operations with a literal `UPSERT`. | [Read → UPSERTS](https://github.com/linked-db/linked-ql/wiki/UPSERTS)             |

<details name="lang-capab" open><summary><b>(a)</b> Basic Example</summary>

```sql
SELECT { name, email } AS user FROM users;
-- Desugars to:
-- SELECT JSON_BUILD_OBJECT('name', name, 'email', email);
```

</details>

<details name="lang-capab"><summary><b>(b)</b> Relationship Traversal</summary>

```sql
SELECT posts.author ~> { id, name } AS author FROM posts;
```

</details>

<details name="lang-capab"><summary><b>(c)</b> Upsert Shortcut</summary>

```sql
UPSERT INTO users (name, email) VALUES ('Jane', 'jane@example.com');
```

</details>

---

## `2 |` Runtime Capabilities

LinkedQL brings live reactivity and structural versioning to your database —
**without patching it or installing extensions.**
These capabilities run entirely at the client layer.

| Feature             | Summary                                                                          | Docs                                                                          |
| :------------------ | :------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Realtime Engine** | Live queries that continuously self-update as data changes.                      | [Read → RealtimeSQL](https://github.com/linked-db/linked-ql/wiki/RealtimeSQL) |
| **Timeline Engine** | Schema history & rollback — version-bound queries and time-travel introspection. | (coming soon)                                                                 |

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

```sql
SELECT * FROM users@2_3; -- Query against schema version 2.3
```

</details>


<details name="runtime-capab"><summary><b>(c)</b></summary>

</details>

---

## `3 |` Offline Capabilities

FlashQL is LinkedQL’s **portable, in-memory SQL engine** —
a full runtime that brings SQL to the client, the edge, and offline environments.

It fills another familiar gap — running full SQL locally —
and adds built-in support for **federation**, **materialization**, and **sync** between remote databases and local state.

| Engine      | Description                                                     | Docs                                                                  |
| :---------- | :-------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **FlashQL** | In-memory SQL runtime supporting PostgreSQL and MySQL dialects. | [Read → FlashQL](https://github.com/linked-db/linked-ql/wiki/FlashQL) |

<details name="offline-capab" open><summary><b>(a)</b> Basic Example</summary>

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
const client = new FlashClient();
await client.query(`CREATE TABLE users (id SERIAL, name TEXT)`);
await client.query(`INSERT INTO users (name) VALUES ('Alice'), ('Bob')`);
const res = await client.query(`SELECT JSON_AGG(name) AS users FROM users`);
console.log(res.rows);
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

## 📚 Documentation

> [!NOTE]
> The main [linked-db/linked-ql/wiki](https://github.com/linked-db/linked-ql/wiki) documents **v0.3.x**.
> Pages tagged **@next** reflect this version.

| Feature           | Wiki Page                                                                    |
| :---------------- | :--------------------------------------------------------------------------- |
| **DeepRefs**      | [DeepRefs →](https://github.com/linked-db/linked-ql/wiki/DeepRefs)           |
| **JSON Literals** | [JSON Literals →](https://github.com/linked-db/linked-ql/wiki/JSON-Literals) |
| **UPSERTS**       | [UPSERTS →](https://github.com/linked-db/linked-ql/wiki/UPSERTS)             |
| **RealtimeSQL**   | [RealtimeSQL →](https://github.com/linked-db/linked-ql/wiki/RealtimeSQL)     |
| **FlashQL**       | [FlashQL →](https://github.com/linked-db/linked-ql/wiki/FlashQL)             |

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

[npm-version-src]: https://img.shields.io/npm/v/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/@linked-db/linked-ql
[npm-downloads-src]: https://img.shields.io/npm/dm/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/@linked-db/linked-ql
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql@next?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql@next
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/next/LICENSE

```

---

This version finally ties your product-pitch clarity to the philosophical spine:  
- “What is LinkedQL?” — product definition.  
- “Why LinkedQL?” — the engineering thesis.  
- Ends with a payoff line that loops back to the practical: *“All of that comes built-in with the classic client API.”*  

It’s succinct, developer-natural, and consistent with the tone across your feature docs.
```
