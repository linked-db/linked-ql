<div align="center">

# LinkedQL  

_A modern take on SQL and SQL databases_

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

<div align="center">

<br>

_Simplify and unify your entire database layer in a single interface_ 🛸<br>
LinkedQL is a database client (`client.query()`) for PostgreSQL and MySQL/MariaDB, but more broadly, an idea: **[SQL reimagined for modern apps ↗](https://linked-ql.netlify.app/overview)**.
LinkedQL solves **live querying for realtime apps, local-first and offline-first data architectures with federation and syncing, relationship traversal, schema versioning and version control system, point-in-time traversal, and more** – all in under `80 KiB min | zip`.

</div>

---

> [!NOTE]
> You’re viewing **@linked-db/linked-ql@latest** — the newest iteration.  
> For the prev 0.3.x versions, see [linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql/tree/0.30.13).

> [!IMPORTANT]
> 🚀 **LinkedQL is in active development and evolving quickly.**<br>
> Backed by **1,000+ tests and growing**, LinkedQL is already strong for **local-first apps (using FlashQL), live queries, federation and sync, and more**.<br>
> Some areas are still catching up, especially **broader DDL coverage, migrations, and full driver parity**.

---

<br>

<div align="center">

| Guide                                     | Explore                                       | Project                           |
|:------------------------------------------|:----------------------------------------------|:----------------------------------|
| [Installation](#installation)             | [Capabilities](#capabilities)                 | [Current Shape](#-current-shape)  |
| [Clients, Runtimes & Dialects](#clients-runtimes--dialects)  | [Features](#features)                         | [Contributing](#-contributing)    |
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

---

## Why LinkedQL

Modern applications no longer interact with a single database in the traditional 1:1 `client.query()` model.

They span:

* HTTP boundaries (client / server runtimes that need to operate over same data),
* client-side storage (requiring a local relational engine),
* offline-first architectures (requiring local replicas backed by a sync engine),
* realtime updates (requiring live queries and realtime subscriptions),
* and evolving schemas over time (often creating breaking changes for the application as schema drifts).

In most stacks, these concerns are handled by **dedicated tools across layers**:

* a database client,
* an API layer,
* a caching strategy,
* a sync mechanism,
* and a reactive layer.

Each layer introduces its own abstractions, inconsistencies, and failure modes.

The biggest problem is probabbly not just the tooling and layering overhead — **it's that there isn't a single execution model**.

Each layer:

* reinterprets queries differently
* introduces its own caching or consistency rules
* and breaks composability across runtime boundaries

**LinkedQL replaces this fragmented model with a single execution contract that holds across all environments**,

and extends that with built-in support for:

* local execution,
* remote execution,
* federation,
* sync,
* and reactivity

---

## Examples Tour

The following scenarios introduce the core concepts and capabilities of LinkedQL.

---

### Scenario 1: Using LinkedQL with PostgreSQL/MySQL/MariaDB

By design, LinkedQL can be used as a **drop-in replacement** for a traditional database client. Import the appropriate client for your database and use it as you normally would.

```js
import { PGClient } from '@linked-db/linked-ql/postgres';

const db = new PGClient({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await db.connect();

// Standard SQL query — no new syntax required
const result = await db.query(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);

console.log(result.rows);

await db.disconnect();
```

#### Decoding the above

* `PGClient` implements the LinkedQL query interface over a native PostgreSQL connection
* The API is intentionally **familiar and minimal**

However, this is not just a wrapper over `node-postgres`.

The same `db.query()` call will later support

* realtime queries
* cross-runtime execution
* local-first sync
* and version-aware querying

**Without changing how you write queries.**

---

### Scenario 2: Using LinkedQL in Client-Side or Edge Runtimes (Introducing FlashQL)

In many environments (browser, edge, tests), a direct database connection is not available.

LinkedQL gives you **FlashQL** for this. FlashQL is the **embeddable runtime of LinkedQL** — a full SQL engine that runs inside your application while preserving the same interface.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

// FlashQL accepts multiple statements in a single call
await db.query(`
  -- Define schema locally
  CREATE TABLE public.users (
    id INT PRIMARY KEY,
    name TEXT
  );

  -- Seed local data
  INSERT INTO public.users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus');
`);

// Query behaves exactly like a remote database
const result = await db.query(`
  SELECT *
  FROM public.users
  ORDER BY id
`);

console.log(result.rows);

await db.disconnect();
```

#### Decoding the above

* `FlashQL` is not a mock or lightweight store — it is a **full relational engine**
* It implements the same query contract as `PGClient`
* Execution is entirely **local**

FlashQL brings:

* MVCC-based transactions
* WAL-backed change tracking
* support for views, joins, relational queries, and more

---

#### Relationship to LinkedQL

FlashQL is best understood as:

> **LinkedQL, embedded.**

It enables:

* local-first architectures
* offline execution
* edge-native data processing
* deterministic replay and sync

All without introducing a second query language or API.

---

### Scenario 3: Cross-Runtime Querying over HTTP

In many applications, the environment issuing queries cannot directly connect to the database.

For example, a database running on the server is often inaccessible to:

* client-side applications (running in the browser)
* applications running on the edge (on edge functions)

LinkedQL introduces a **transport protocol** that allows `db.query()` to work across these boundaries: the **Edge Protocol**, delivered via an `EdgeClient` / `EdgeWorker` pair.

---

#### Client (caller runtime)

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

// Represents a remote LinkedQL-capable endpoint
const db = new EdgeClient({
  url: '/api/db',
  type: 'http',
});

const result = await db.query(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);
```

---

#### Server (execution runtime)

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { PGClient } from '@linked-db/linked-ql/postgres';

// Real database connection
const upstream = new PGClient({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await upstream.connect();

// Adapter that exposes the LinkedQL protocol over HTTP
const worker = new EdgeWorker({
  client: upstream,
});

// Now the handler (at "/api/db") that exposes the worker:
export async function POST(request) {

  // EdgeClient encodes operations as (op, args)
  const op = new URL(request.url).searchParams.get('op');
  const args = await request.json();

  // Delegate execution to the upstream client
  const result = await worker.handle(op, args);

  return Response.json(result ?? {});
}
```

---

#### Decoding the above

* `EdgeClient` is **not just a fetch wrapper**

* `EdgeClient` implements the same client contract as `PGClient` and `FlashQL`. The difference is that execution happens across a transport boundary instead of locally or over a direct database connection.

* `EdgeWorker`:

  * receives protocol calls
  * maps them to a real LinkedQL client (`PGClient`, `FlashQL`, etc.)
  * and returns results in the same shape

---

#### What this solves

* Removes the need for a separate API layer for database queries
* Preserves the `db.query()` abstraction across runtime boundaries
* Avoids leaking database credentials to untrusted environments

---

#### Important

This is not limited to browser → server models.

`EdgeClient` can be used anywhere a transport boundary exists:

* server → server
* edge → origin
* worker → worker
* browser → worker (as seen in Scenario 4 below)

---

### Scenario 4: Cross-Runtime Querying over Message Ports

The same protocol used over HTTP can also run over **message channels**.

A typical use case is:

* An app runs on the browser main thread
* A LinkedQL instance (backed by IndexedDB) runs in a web worker

---

#### Main thread

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

// Instead of HTTP, this connects to a worker
const db = new EdgeClient({
  url: '/db-worker.js',
  type: 'worker',
});

const result = await db.query(`
  SELECT id, name
  FROM public.users
`);
```

---

#### Worker

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { PGClient } from '@linked-db/linked-ql/postgres';

const upstream = new PGClient({ /* config */ });
await upstream.connect();

// Automatically wires message port → LinkedQL protocol → upstream client
EdgeWorker.webWorker({
  client: upstream,
});
```

---

#### Decoding the above

* The same LinkedQL Edge Protocol is used
* Only the **transport changes** (message ports, instead of HTTP)
* The calling code (`db.query()`) remains identical

---

#### The Edge Protocol does the heavy lifting

As against just sending raw SQL over HTTP, the client (`EdgeClient`) sends structured operations that map directly to the LinkedQL client interface (e.g. `query()`, `stream()`, `subscribe()`, etc.).

This preserves:

+ execution semantics
+ result shapes
+ and advanced capabilities like live queries

---

### Scenario 5: Local-First and Offline-First Architectures

In this scenario, we demonstrate a hybrid data architecture where the goal is to:

> Query remote data **as if it were local**, while controlling
> what stays remote, what gets cached locally, and what stays in sync.

This is where LinkedQL moves beyond “client” and becomes a **data architecture layer**.

We'll introduce the concepts in steps.

---

#### Step 1: Connect a Local Engine to a Remote Origin

We start with FlashQL as our local database.

Then we teach it how to reach a remote database when needed.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

// The local database
const db = new FlashQL({

  // Called whenever a foreign origin needs a client
  async onCreateForeignClient(origin) {

    if (origin === 'primary') {
      // This client will be used to reach the remote database we've designated as 'primary'
      return new EdgeClient({
        url: '/api/db',
        type: 'http',
      });
    }

    throw new Error(`Unknown origin: ${origin}`);
  }
});

await db.connect();
```

---

##### Decoding the above

* FlashQL is your **local relational engine**
* `"primary"` is simply the name we want to give to a **remote database**. (FlashQL lets the origin details be application-defined. It can be a bare identifier as used here, or an URL, or something else.)
* `EdgeClient` is how FlashQL will talk to that remote system

At this point:

* nothing is mirrored yet
* no data is local
* we’ve only defined **how to reach the remote** from the local

But the local database by itself is ready for use as before:

```js
// FlashQL accepts multiple statements in a single call
await db.query(`
  -- Define schema locally
  CREATE TABLE public.users (
    id INT PRIMARY KEY,
    name TEXT
  );

  -- Seed local data
  INSERT INTO public.users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus');
`);
```

---

#### Step 2: Declare a Foreign Namespace

Moving on to the goal of not just a local database but one that can mirror remote data sources, we'll now create the local "containers" for the remote data.

First, we create a local "namespace" – more traditionally called a "schema" – that contains the tables we'll use to mirror remote tables.

```js
await db.storageEngine.transaction(async (tx) => {

  await tx.createNamespace({
    name: 'remote',

    // Logical name of the remote system
    replication_origin: 'primary',

    // Indicates how to reach it (via EdgeClient)
    replication_origin_type: 'edge',
  });

});
```

---

##### Decoding the above

* The programmatic `tx.createNamespace()` call above is equivalent to `db.query('CREATE SCHEMA remote')`, but it lets us add the concept of **foreign origin**
* `remote` is a **real local namespace (schema)** that can have tables and views (`VIEWS`) just like a regular namespace
* The difference is what happens when you create a view: **they will mirror tables in the remote database instead of mirror tables in the local database**

Think of the **views** + **foreign origin** combination as the way to mirror remote data sources.

We move on to that part now.

---

#### Step 3: Let’s Mirror Foreign Tables Locally

Now we create **views** that mirror foreign tables.

LinkedQL provides **three mirroring modes**:

| Mode                                             | Behavior                               |
| ------------------------------------------------ | -------------------------------------- |
| Views defined as: `persistence="origin"`       | These views don't copy the remote data locally; they simply act as local references to remote data – resolved at query-time. These are called "origin Views" |
| Views defined as: `persistence="materialized"` | These views copy the remote data locally and behave as local tables from that moment on; cached data is refreshed manually. These are called "materialized Views" |
| Views defined as: `persistence="realtime"`     | These views copy the remote data locally and behave as local tables from that moment on; **but most notably, local data is kept in sync with remote data**. These are called "realtime Views" |

We demonstrate each mode below.

---

##### Mode 1: Origin Views (Pure Federation)

```js
await db.storageEngine.transaction(async (tx) => {

  await tx.createView({
    // Define under the local namespace called "remote"
    namespace: 'remote',
    name: 'users',

    persistence: 'origin',

    // Refers to public.users in the remote DB
    view_spec: { namespace: 'public', name: 'users' },
  });

});
```

---

###### Decoding this mode

* No data is stored locally
* Every query hits the remote database
* Acts as a **live window into the remote table**

This is **federation**:

> Querying external data as if it were part of your local schema

---

##### Mode 2: Materialized Views (Local Cache)

```js
await db.storageEngine.transaction(async (tx) => {

  await tx.createView({
    // Define under the local namespace called "remote"
    namespace: 'remote',
    name: 'orders',

    persistence: 'materialized',

    // Refers to public.orders in the remote DB
    view_spec: { namespace: 'public', name: 'orders' },
  });

});
```

---

###### Decoding this mode

* Data is stored locally inside FlashQL
* It does **not update automatically**
* It must be refreshed explicitly

This is **materialization**:

> Keeping a local snapshot of remote data for performance or offline use

---

##### Mode 3: Realtime Views (Live Mirror)

```js
await db.storageEngine.transaction(async (tx) => {

  await tx.createView({
    // Define under the local namespace called "remote"
    namespace: 'remote',
    name: 'posts',

    persistence: 'realtime',

    // Refers to public.posts in the remote DB
    view_spec: { query: `SELECT * FROM public.posts WHERE post_type = 'NEWS'` },
  });

});
```

---

###### Decoding this mode

* Data is stored locally
* Changes from the remote database are streamed in
* The local copy stays continuously updated

This is **realtime mirroring**:

> A local table that tracks the remote table over time

Notice from the above that `view_spec` can be any SQL query as against just a `namespace → name` declaration.

---

#### Step 4: Running Sync

Having just defined the views, we activate the synchronization via:

```js
await db.sync.sync();
```

---

##### What `sync()` does

`sync()` is the coordination engine for "materialized" and "realtime" views.
It is what turns definitions (VIEWS) into state (local data + subscriptions).

It:

* fetches data for all `materialized` views
* does the same for `realtime` views and starts syncing right away – with backpressure and replay support:
  * performs catch-up if the app was offline
  * ensures local state matches expected remote state

---

##### `sync()` is:

* **Idempotent** → safe to call multiple times
* **Resumable** → continues from last known state
* **Network-aware** → designed for reconnect flows

##### Typical usage:

First: **the initial call after defining views**;<br>
(with the same called again automatically internally on database reboot):

```js
await db.sync.sync();
```

Second: **the optional app-level wiring to the network signal switch:**

```js
window.addEventListener('online', () => {
  db.sync.sync(); // re-sync on reconnect
});
```

---

#### Step 5: Querying the Unified Graph

At query time, LinkedQL builds a composed execution plan:

* `origin` views are resolved remotely
* `materialized` and `realtime` views are resolved locally
* results are merged into a single relational execution

```js
const result = await db.query(`
  SELECT
    u.id,
    u.name,
    o.total,
    p.title
  FROM remote.users u        -- origin VIEW: resolved on demand from remote DB
  LEFT JOIN remote.orders o  -- materialized VIEW: served locally
    ON o.customer_id = u.id
  LEFT JOIN remote.posts p   -- realtime VIEW: served locally, kept in sync
    ON p.author_id = u.id
  LEFT JOIN public.test t    -- regular table: served locally
    ON t.user_id = u.id
  ORDER BY u.id
`);
```

---

#### Resolution summary

* `remote.users` → fetched on demand from the remote DB
* `remote.posts` → served locally, kept in sync
* The query treats both as part of the same relational graph

---

## LinkedQL at a Glance – So Far

- You always write: `db.query(SQL)`
- yet `db` can be:
  - a real database
  - a local engine
  - a remote bridge
  - or a composed graph of both
- Views define:
  - where data is resolved (local vs remote)
  - and how it is kept in sync
- `sync()` keeps everything consistent

---

## Clients, Runtimes & Dialects

| **Dialect**         | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/postgres`      | [PostgreSQL ↗](https://linked-ql.netlify.app/docs/setup#postgresql) |
| MySQL               | `@linked-db/linked-ql/mysql`   | [MySQL ↗](https://linked-ql.netlify.app/docs/setup#mysql)           |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [MariaDB ↗](https://linked-ql.netlify.app/docs/setup#mariadb)       |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flashql`   | [FlashQL ↗](https://linked-ql.netlify.app/docs/setup#flashql)       |
| EdgeClient          | `@linked-db/linked-ql/edge`    | [Edge / Browser ↗](https://linked-ql.netlify.app/docs/setup#edge)   |
| EdgeWorker          | `@linked-db/linked-ql/edge-worker` | [Edge Worker ↗](https://linked-ql.netlify.app/docs/setup#edge) |

## Query Interface

LinkedQL maintains a **unified and familiar interface** across all dialects — whether remote or local.
Method signatures and return values are consistent and documented in the
[**Client API Reference ↗**](https://linked-ql.netlify.app/docs/query-api)

---

## Capabilities

| Capability                    | Description                                                                                                                    |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Live Queries**            | Turn on reactivity over SQL with `{ live: true }`, including joins, aggregates, ordering, and windowed result updates. |
| 🔗 **DeepRef Operators**      | Traverse relationships using simple path notation (`~>` / `<~`). Insert or update nested structures using the same syntax. |
| 🧩 **JSON Literals**          | Bring JSON-like clarity to SQL with first-class support for JSON notation and object-shaped payloads. |
| 🪄 **Upserts**                | Use a literal UPSERT statement and familiar conflict-handling flows across supported runtimes. |
| 🧠 **Version Binding**        | Bind queries to expected relation versions so an app can fail fast when storage shape no longer matches assumptions. |
| 💾 **Edge & Offline Runtime** | Run or embed SQL locally in FlashQL — in browsers, workers, or edge devices — with persistence and replay. |
| 🌐 **Federation & Sync**      | Unify remote databases and local stores into a single relational graph with materialized and realtime synced views. |

## Features

| Feature                                   | Description                                                                                             |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| 💻 **Classic `client.query()` Interface** | Same classic client interface, with advanced capabilities for modern applications. |
| 🔗 **Multi-Dialect Support**              | A universal parser that understands PostgreSQL, MySQL, MariaDB, and FlashQL — one client, many dialects.           |
| 💡 **Lightweight Footprint**              | A full reactive data layer in one compact library — under 80 KiB (min/zip). |
| 🎯 **Automatic Schema Inference**         | No upfront schema work. LinkedQL auto-discovers your schema and stays schema-driven across complex tasks.      | 
| 🧱 **Embeddable Storage Engine**          | FlashQL brings MVCC, WAL persistence, selectors, views, sync metadata, and replay into an embeddable engine. |
| 🛰️ **Realtime + Sync Pipeline**           | Local materialized and realtime views can be refreshed and resumed through a single sync entry point. |
| 🪄 **Diff-Based Migrations**              | Planned: evolve schemas declaratively through change detection instead of hand-written migration scripts.        |

## Architectural Strengths

| Strength | Description |
| :-- | :-- |
| **MVCC Storage Model** | FlashQL is built around transactional MVCC semantics rather than mutable in-place state. |
| **Transaction-First API** | Query, stream, live query, edge transport, and explicit transaction flows all align around transactional execution. |
| **Views As Primitives** | `origin`, `materialized`, and `realtime` views are first-class building blocks, not bolted-on adapters. |
| **Modern WAL API** | `client.wal.subscribe(...)` gives app-facing changefeed consumption without forcing raw database replication ergonomics into the UI layer. |
| **Concurrency & Replay** | WAL persistence, replay, catch-up, and conflict-aware storage behavior make local-first flows practical instead of purely optimistic. |
| **Version Binding** | Queries can assert the relation versions they were designed against and fail fast if app assumptions drift from storage. |

## Documentation

Visit the [LinkedQL documentation site ↗](https://linked-ql.netlify.app)

| Jump to |  |
|:--|:--|
| [Getting Started ↗](https://linked-ql.netlify.app/docs) | Get started with LinkedQL in under three minutes. No database required |
| [Capabilities Overview ↗](https://linked-ql.netlify.app/capabilities) | Jump to the Capabilities section. |
| [Meet FlashQL ↗](https://linked-ql.netlify.app/flashql) | Meet FlashQL — LinkedQL's embeddable SQL engine. |
| [Engineering Deep Dive ↗](https://linked-ql.netlify.app/engineering/realtime-engine) | Dig into LinkedQL's engineering in the engineering section. |

---

## ⏳ Current Shape

### Strong Today

* **Parser and query surface** across PostgreSQL, MySQL, MariaDB, and FlashQL
* **FlashQL as an embeddable local engine** with persistence, replay, version binding, and sync metadata
* **Live queries and app-centric WAL consumption**
* **Federation and sync flows** built around `origin`, `materialized`, and `realtime` views
* **A growing verification story** with more than `1,000` tests across parser, engine, realtime, edge, and sync flows

### Still Evolving

* **Broader DDL parity**, especially around more complete alter/migration flows
* **Mainstream driver parity and hardening** across all environments
* **Docs and production guidance** for larger deployments
* **Migration tooling and richer timeline workflows**

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
