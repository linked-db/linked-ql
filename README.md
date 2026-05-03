<div align="center">

# LinkedQL  

Portable query engine for modern applications and agents.

[![npm version][npm-version-src]][npm-version-href]<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
[![coverage][coverage-src]][coverage-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<picture>
  <source media="(max-width:799px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width:800px)" srcset="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/master/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
</picture>

<br>

> ```js
> const db = new PGClient(); // or: MySQLClient | FlashQL | EdgeClient | etc
> 
> const result = await db.query(
>   `SELECT {
>     id,
>     profile: { name, email },
>     parent: parent_user ~> { name, email }
>   } FROM users;`,
> 
>   { live: true }
> );
> ```

> <details>
> <summary>Show result: output shape + live behaviour</summary>
> 
> ```js
> // Structured output (via "{ ... }"):
> result.rows[0].profile.name;
> 
> // Foreign key traversal (via "~>"):
> result.rows[0].parent.name;
> 
> // Live queries:
> // result.rows updates automatically as underlying data changes
> 
> // (any reactive system can observe these updates)
> Observer.observe(result.rows[0].parent, 'email', (c) => {
>   console.log(c.value, c.oldValue);
> });
> ```
> </details>

<br>

<div align="left">

LinkedQL brings:

+ live queries, lazy fetching, changefeeds, and sync  
+ expressive shorthands for relationships and JSON  
+ automatic schema versioning and query-time version safety  

Runs across:

+ PostgreSQL, MySQL/MariaDB, and embedded/local storage  
+ server, browser, edge, and worker runtimes  
+ local & remote data sources – in any combination  

→ All in just `~100 KiB` (min+zip)  
→ A single interface that drops into any application  

**[See the overview ↗](https://linked-ql.netlify.app/overview)** for the full picture.

</div>

---

> [!IMPORTANT]
> LinkedQL is shaping up fast, and currently backed by over 1,200 tests.<br>
> Feedback, issues, and PRs help drive us towards the next thousand tests and beyond.<br>
> See [Contributing](#-contributing)

---

## Installation & Overview

LinkedQL is distributed as an npm package:

```bash
npm install @linked-db/linked-ql
```

It provides clients for all supported SQL dialects — including **FlashQL**, the embeddable SQL engine for local and offline use.

### Clients, Runtimes & Dialects

Import and use the client for your database.

| **Client/Model** | **Import Path**                    | **Guide**                                                               |
| :--------------- | :--------------------------------- | :---------------------------------------------------------------------- |
| `PGClient`       | `@linked-db/linked-ql/postgres`    | [PostgreSQL ↗](https://linked-ql.netlify.app/guides/postgresql)     |
| `MySQLClient`    | `@linked-db/linked-ql/mysql`       | [MySQL ↗](https://linked-ql.netlify.app/guides/mysql)               |
| `MariaDBClient`  | `@linked-db/linked-ql/mariadb`     | [MariaDB ↗](https://linked-ql.netlify.app/guides/mariadb)           |
| `FlashQL`        | `@linked-db/linked-ql/flashql`     | [FlashQL ↗](https://linked-ql.netlify.app/guides/flashql)           |
| `EdgeClient`     | `@linked-db/linked-ql/edge`        | [Edge / Browser ↗](https://linked-ql.netlify.app/guides/edge#edgeclient) |
| `EdgeWorker`     | `@linked-db/linked-ql/edge-worker` | [Edge Worker ↗](https://linked-ql.netlify.app/guides/edge#edgeclient)    |

See:

* [LinkedQL Guides ↗](https://linked-ql.netlify.app/guides)

---

## Core Interface

LinkedQL exposes a minimal and consistent database interface:

```js
await db.query(sql, options);
await db.query(sql, { live: true, ...options });
await db.stream(sql, options);
await db.transaction(fn);
await db.wal.subscribe(selector, handler);
await db.sync.sync(); // (FlashQL)
```

The same surface applies whether `db` is a direct PostgreSQL client, a local FlashQL engine, or an `EdgeClient`.

See:

+ [The Core API](https://linked-ql.netlify.app/api)

---

## What can you do with LinkedQL

LinkedQL collapses the traditional data stack — database, API layer, and sync engine — into a single model.

The [overview](https://linked-ql.netlify.app/overview) page is your map to what LinkedQL enables.

Below are a few examples that build up that model step by step.

### 1. Shape data directly in the query

**JSON Literals** let you define the exact shape your application expects directly in SQL.

```js
const result = await db.query(`
  SELECT {
    id: u.id,
    name: u.name,
    profile: {
      email: u.email,
      age: u.age
    }
  } AS user
  FROM users u;
`);
```

No remapping step or post-processing code. The query itself defines the shape.

This is fully covered in [JSON Literals ↗](https://linked-ql.netlify.app/lang/json-literals)

### 2. Traverse relationships directly

**DeepRefs** let you follow relationships directly in SQL using simple arrow notations.

| Notation | Meaning                                |
| :------- | :------------------------------------- |
| `~>`     | forward traversal (follow a reference) |
| `<~`     | reverse traversal (find dependents)    |

#### Forward Traversal

```js
const result = await db.query(`
  SELECT
    id,
    parent_user ~> email AS parent_email
  FROM users;
`);
```

This says:

→ *"Given a foreign key (`parent_user`)"*  
→ *"Tie in the referenced row; select `email`"*  

#### Reverse Traversal

```js
const result = await db.query(`
  SELECT
    id,
    (parent_user <~ users) ~> email AS child_email
  FROM users;
`);
```

This walks “backwards” through a relationship:

* Ties in rows that reference the current row
* Selects the `email` column from each

#### Structured Traversal

```js
const result = await db.query(`
  SELECT {
    id,
    profile: { name, email },
    parent: parent_user ~> { id, name, email }
  } FROM users;
`);
```

* Lets you model structures deeply
* Swaps complex alias bookkeeping with clear mental models

#### Insert and update into relationships

```js
await db.query(`
  INSERT INTO users
    (email, parent_user ~> (id, email))
  VALUES
    ('ada@example.com', ROW (50, 'parent@example.com'));
`);
```

This lets you construct relationships directly in an insert:

→ *"Given a base row"*  
→ *"Insert a related row that automatically references the base"*  

#### What this changes

No need for an ORM or manual JOIN logic.

If you've defined foreign key relationships in your tables, you can traverse them directly in the query.

Deeper syntax and traversal patterns are fully covered in [DeepRefs ↗](https://linked-ql.netlify.app/lang/deeprefs).

### 3. Run Live Queries

LinkedQL brings live queries to your database: **PostgreSQL**, **FlashQL**, **MySQL/MariaDB\***.

With just a mode switch `{ live: true }`, you get back a live, self-updating result set.

```js
const result = await db.query(`
  SELECT p.title, p.category
  FROM posts AS p
  WHERE p.published = true
  ORDER BY p.created_at DESC
`, { live: true });
```

`result.rows` updates automatically as the database changes:

- new rows appear
- removed rows disappear
- updated rows mutate in place

#### What this changes

No need for dedicated GraphQL servers in front of your database.

The query itself is the subscription.

#### Not limited by query complexity

```js
const result = await db.query(`
  SELECT
    p.title,
    p.category,
    author ~> { name, email } AS author
  FROM posts AS p
  WHERE p.published = true
  ORDER BY p.created_at DESC
`, { live: true });
```

→ Supports the full `SELECT` range – joins, filters, aggregates, etc.  
→ Supports the full set of LinkedQL syntax shorthands like **DeepRefs** and **JSON Literals**

#### Backed by a robust live query engine

See the full story in [Live Queries ↗](https://linked-ql.netlify.app/realtime/live-queries).  
See the [Realtime Engine ↗](https://linked-ql.netlify.app/engineering/realtime-engine) paper for a deeper dive.

> [!NOTE]
> Fully supported across:
> * databases: **PostgreSQL**, **FlashQL**, etc. (**MySQL/MariaDB** support coming soon)
> * runtimes and deployment models: **client** / **server** / **worker** / **edge**

### 4. Run SQL locally with FlashQL

Meet FlashQL – a full SQL engine that runs anywhere + inside your application.

It's LinkedQL's embeddable SQL engine.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

const result = await db.query(`
  CREATE TABLE users (
    id INT PRIMARY KEY,
    name TEXT
  );

  INSERT INTO users VALUES (1, 'Ada'), (2, 'Linus');

  SELECT * FROM users ORDER BY id;
`);

console.log(result.rows);

await db.disconnect();
```

FlashQL brings the full LinkedQL feature set into an embedded, local-first runtime.

Built for:

* local-first and offline-first architectures
* data federation and sync across local/remote boundaries

See [FlashQL ↗](https://linked-ql.netlify.app/flashql) for a detailed overview.

### 5. Build distributed or offline-first architectures with Sync

LinkedQL uses a small set of primitives (`EdgeClient`, `FlashQL`) to unlock **data federation**, **sync**, and **offline-first architectures**.

For example:

You can spin up a FlashQL instance locally, backed by an upstream database.

```js
const db = new FlashQL({
  getUpstreamClient: (url) =>
    new EdgeClient({ url, type: 'http' }),
});

await db.connect();
```

It lets you declare remote data as local tables (views):

```js
await db.query(`
  CREATE VIEW users AS
  SELECT * FROM users
  WITH (replication_origin = 'postgres:/api/db');
`);
```

This simple setup gives you **data federation** across boundaries:

> **query both local and remote data as one relational graph**:

```js
const result = await db.query(`
  SELECT *
  FROM users u
  JOIN orders o ON o.user_id = u.id;
`);
```

With just an extra keyword, you get **automatic sync between local and remote states**:

```js
await db.query(`
  CREATE REALTIME VIEW users AS
  SELECT * FROM users
  WITH (replication_origin = 'postgres:/api/db');
`);
```

* Upstream changes apply automatically
* Local changes sync back upstream

#### What this enables

With a single abstraction:

* remote data is materialized locally as tables
* queries span local and remote sources seamlessly
* changes sync in both directions automatically
* your app continues to work offline and on reconnects
* no separate sync engine, API layer, or replication pipeline

What typically takes a database, API layer, cache, and sync engine is reduced to one relational model — expressed entirely in SQL.

This is fully covered in:

* [Federation, Materialization, and Sync ↗](https://linked-ql.netlify.app/flashql/federation-and-sync)
* [LinkedQL Integration Patterns ↗](https://linked-ql.netlify.app/guides/integration-patterns)

---

## Pattern Playground

A visual, interactive playground that lets you experiment with these integration patterns is coming soon.

But here are real samples you can play with now, right in the `@webqit/node-live-response` repo:

**[Go to the playground ↗](https://github.com/webqit/node-live-response/tree/main/playground)**

---

## Deep Dive

If you want to explore the full LinkedQL model, see:

**[LinkedQL Overview ↗](https://linked-ql.netlify.app/overview)**

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

---

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
