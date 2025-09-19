<div align="center">
    
# Linked QL

_**Next-generation SQL (Postgres & MySQL)** for modern apps._

[![npm version][npm-version-src]][npm-version-href] [![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

</div>

<br>

<picture>
  <source media="(max-width: 799px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width: 800px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true" alt="Linked QL Banner" width="100%">
</picture>

<br>

<div align="center">

[👉 Follow](https://x.com/LinkedQL) • [💖 Sponsor](https://github.com/sponsors/ox-harris)

---

LinkedQL is next-generation SQL (Postgres and MySQL) for modern apps — with syntax niceties, built-in reactivity, self-versioning, and workflow automation — all without leaving SQL.

Linked QL is JS-based and works both in Nodejs and in the browser (coming soon)

</div>

> [!IMPORTANT]  
> This is **@linked-db/linked-ql@next** — our upcoming iteration.  
> See [@linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql) for the current version (covered in the [wiki](https://github.com/linked-db/linked-ql/wiki)).

## 🚀 Quick-start

1) Install

```bash
npm i @linked-db/linked-ql@next
```

2) Use as your regular PG or MySQL client

```js
import { PGClient } from '@linked-db/linked-ql/pg';
```

```js
const client = new PGClient({
  host: 'localhost',
  port: 5432,
});
await client.connect();
```

```js
const result = await client.query(`SELECT 10`);
```

3) Do powerful things... like:

```js
const users = await client.query(
  `SELECT title, content, author ~> name AS author_name FROM books
  WHERE author ~> role = $1`,
  ['admin']
);
```

<!--
## ⚓ Motivation?

- **SQL can be painful**
  - Often hard-to-grok syntax that goes quickly wild → unmaintainable → high-risk
  - The classic schema drag & migration woes — being inherently manual → fragile → broken

- **Plus, need reactivity?**—extra tooling & extra infra → additional moving parts → more overheads
  <!-- Even as _realtime-first_ increasingly becomes base-line expectation for modern apps- ->
-->

## 💡 Features

|  |  |
|:---|:---|
| _Reactivity_ | [Live queries](#11--live-queries) |
| _Syntax Niceties_ | [DeepRefs](#21--deeprefs) • [JSON shorthands](#22--json-shorthands) • [The UPSERT statement](#23--the-upsert-statement) |
| _Schema Niceties_ | [Automatic database versioning](#31--automatic-database-versioning) • [Version binding](#32--version-binding) • [Diff-based migrations](#33--diff-based-migrations) |
| _IDE Tooling_ | [Static error checking](#41--static-error-checking) • [Type safety](#42--type-safety) • [Autocompletion](#43--autocompletion) |

### ` 1 |` Reactivity

#### `2.1 |` Live queries

⚡ _Run reactive SQL with `{ live: true }`

```js
// Pass { live: true } to get live results
const users = await client.query(
  `SELECT title, content, author ~> name AS author_name FROM books`,
  { live: true }
);
```

### ` 2 |` Syntax Niceties

#### `2.1 |` DeepRefs

⮑  _Follow relationships using simple arrow notation: `a ~> c ~> d`_

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

#### `2.2 |` JSON shorthands

🧩 _Use JSON notation directly_: `{}`, `[]`

```js
// Shape your output data visually
const users = await client.query(
  `SELECT
    { first: first_name, last: last_phone } AS name,
    [ email, phone ] AS contact
  FROM users`
);
```

#### `2.3 |` The UPSERT statement

📦 _Do upserts without conditional clauses_

```js
// Forget ON CONFLICT / ON DUPLICATE KEY
const users = await client.query(
  `UPSERT INTO public.users 
    (name, email, role)
  VALUES
    ('John Doe', 'jd@example.com', 'admin'),
    ('Alice Blue', 'ab@example.com', 'guest')`
);
```

### ` 3 |` Schema Niceties

#### `3.1 |` Automatic database versioning

⏱ _Enjoy automatic database versioning on every DDL operation_

```js
// A savepoint is automatically created for you on every DDL operation
const savepoint = await client.query(
  `CREATE TABLE public.users (
    id int,
    name varchar
  )
  RETURNING SAVEPOINT`,
  { desc: 'Create users table' }
);
```

```js
// Inspect savepoint details
console.log(savepoint.versionTag()); // 1
console.log(savepoint.commitDesc()); // Create users table
console.log(savepoint.commitDate()); // 2024-07-17T22:40:56.786Z
```

```js
// Rollback at any time (drops the table above)
await savepoint.rollback({ desc: 'Users table no more necessary' });
```

#### `3.2 |` Version binding

🧷 _Bind queries to specific database or table versions_: `tbl@3`

```js
// Make this query version-safe
await client.query(
  `SELECT * FROM users@3`
);
```

#### `3.3 |` Diff-based migrations

🤖 _Define and evolve schemas declaratively; put migration on autopilot_

> coming soon - with a screencast

### ` 4 |` IDE Tooling

#### `4.1 |` Static error checking

🔍 _Catch mistakes before they hit production_

> coming soon - with a screencast

#### `4.2 |` Type safety

🛡️ _Strong types, no guessing_

> coming soon - with a screencast

#### `4.3 |` Autocompletion

💡 _Smarter autocompletion in your editor_

> coming soon - with a screencast

---

## ✍️ Documentation

## ⏳ Our progress on this iteration of LinkedQL

Things are moving really fast; and I'm keeping the progress bars here live

**Core Parser/Compiler**  
> `████████████████████` 100%  

**Core Transform Engine**  
> `████████████████████` 100%  

**InMemory DB Engine**  
> `████████████████░░░░` 80%  

**DB Drivers - PG, MySQL, InMem (MySQL catching up)**  
> `██████████████████░░` 90%

**Realtime Engine**  
> `████████████████░░░░` 80%

**Version Binding**  
> `████░░░░░░░░░░░░░░░░` 20%

**Revamped Auto-Versioning Engine (_defer to @linked-db/linked-ql@0.3.\*_)**  
> `██░░░░░░░░░░░░░░░░░░` 10%

**Revamped Migration Wizard (_defer to @linked-db/linked-ql@0.3.\*_)**  
> `██░░░░░░░░░░░░░░░░░░` 10%

**IDE Tooling**  
> `██░░░░░░░░░░░░░░░░░░` 10%  

**Revamped Docs**  
> `░░░░░░░░░░░░░░░░░░░░` 0%  

## 🐛 Issues

Report bugs or request features via [issues](https://github.com/linked-db/linked-ql/issues).

## 🔑 License

MIT. (See [LICENSE](https://github.com/linked-db/linked-ql?tab=MIT-1-ov-file))

---

[npm-version-src]: https://img.shields.io/npm/v/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/@linked-db/linked-ql
[npm-downloads-src]: https://img.shields.io/npm/dm/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/@linked-db/linked-ql
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql@next?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql@next
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/next/LICENSE
