<div align="center">

# LinkedQL  

One SQL interface for local, remote, and live queries

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
>   // live mode
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
> // Live queries (via { live: true }):
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

+ live queries, streaming, subscriptions, and sync  
+ expressive shorthands for relationships and JSON  
+ automatic schema versioning and query-time version safety  

Runs across:

+ PostgreSQL, MySQL/MariaDB, local and in-memory storage  
+ server, browser, edge, and worker runtimes  
+ both local and remote data as one relational graph  

→ All in under `80 KiB` (min+zip)  
→ A single interface that drops into any application

> One SQL interface for local, remote, and live queries

**[See here ↗](https://linked-ql.netlify.app/capabilities)** for the big picture.

</div>

---

> [!IMPORTANT]
> LinkedQL is backed by **over 1,000 tests and growing**.<br>
> Early usage feedback, issues and PRs help us on our path to the next 1,000 tests.<br>
> See [Contributing](#-contributing)

---

<br>

<div align="center">

| Guide                                     | Explore                                       | Project                           |
|:------------------------------------------|:----------------------------------------------|:----------------------------------|
| [Installation & Overview](#installation--overview) | [LinkedQL at a Glance](#linkedql-at-a-glance) | [Current Shape](#-current-shape)  |
| [Section 1: Core Interface](#section-1-core-interface) | [Features](#features)                         | [Contributing](#-contributing)    |
| [Section 2: Language & Query Model](#section-2-language--query-model) | [Documentation](#documentation)               | [License](#-license)              |
| [Section 3: Architecture & Orchestration](#section-3-architecture--orchestration) | [Capabilities](#capabilities) | [Clients, Runtimes & Dialects](#clients-runtimes--dialects) |

</div>

<br>

---

## Installation & Overview

LinkedQL is distributed as an npm package. Install it with:

```bash
npm install @linked-db/linked-ql
```

The package provides clients for all supported SQL dialects — including **FlashQL**, the embeddable SQL engine for local or offline use.

### Clients, Runtimes & Dialects

Import and use the Client for your database. LinkedQL works the same across all clients.

| **Client/Model**         | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| `PGClient`          | `@linked-db/linked-ql/postgres`      | [PostgreSQL ↗](https://linked-ql.netlify.app/docs/setup#postgresql) |
| `MySQLClient`               | `@linked-db/linked-ql/mysql`   | [MySQL ↗](https://linked-ql.netlify.app/docs/setup#mysql)           |
| `MariaDBClient`             | `@linked-db/linked-ql/mariadb` | [MariaDB ↗](https://linked-ql.netlify.app/docs/setup#mariadb)       |
| `FlashQL`             | `@linked-db/linked-ql/flashql`   | [FlashQL ↗](https://linked-ql.netlify.app/docs/setup#flashql)       |
| `EdgeClient`          | `@linked-db/linked-ql/edge`    | [Edge / Browser ↗](https://linked-ql.netlify.app/docs/setup#edgeclient)   |
| `EdgeWorker`          | `@linked-db/linked-ql/edge-worker` | [Edge Worker ↗](https://linked-ql.netlify.app/docs/setup#edgeworker) |

See also:

* [Setup Guides ↗](https://linked-ql.netlify.app/docs/setup)

---

### Example 1: Using LinkedQL with PostgreSQL/MySQL/MariaDB

LinkedQL is designed to be used as a **drop-in replacement** for a traditional database client. That basically looks like this:

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

But, this is also not just a wrapper over `node-postgres`. It's the full LinkedQL contract with just a PostgreSQL backend.

---

### Example 2: Using LinkedQL in Client-Side or Edge Runtimes (Introducing FlashQL)

In many environments (browser, edge, tests), a direct database connection is not available.

LinkedQL gives you **FlashQL** for this. FlashQL is the **embeddable runtime of LinkedQL** — a full SQL engine that runs inside your application.
See [FlashQL Overview ↗](https://linked-ql.netlify.app/flashql).

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

// FlashQL accepts multiple statements in a single call
await db.query(`
  -- Define tables locally
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

* `FlashQL` is not a mock store. It's a **full relational engine**, and the same LinkedQL contract
* Execution is entirely **local** – with a configurable backend

FlashQL brings:

* a transaction-first, MVCC architecture (similar to PostgreSQL's)
* WAL-backed change tracking (similar to PostgreSQL's)
* support for views, CTEs, joins, relational queries, and more

---

#### Relationship to LinkedQL

FlashQL is best understood as:

> **LinkedQL, embedded.**

It enables:

* local-first architectures
* offline execution
* edge-native data processing
* deterministic replay and sync

without introducing a second query language or API.

---

## Section 1: Core Interface

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

For result shapes, options, and API details, see the [Query API docs ↗](https://linked-ql.netlify.app/docs/query-api).

---

### 1. Queries

`db.query()` is the base operation.

```js
const result = await db.query(`
  SELECT id, name
  FROM users
  ORDER BY id
`);
```

#### Behavior

* Executes a SQL query and returns a materialized result set
* Supports multi-statement execution

---

### 2. Live Queries

> Currently available in FlashQL, PostgreSQL, Edge clients. Coming soon to MySQL/MariaDB

Live queries are queries with real-time results. They execute once, but stay in sync with the database over time.

You turn on live mode with `{ live: true }`. You get back a live, self-updating result set.

```js
const liveResult = await db.query(
  `SELECT *
  FROM users
  ORDER BY id`,
  { live: true }
);
```

#### Behavior

* Returns a self-updating result set (`result.rows`) that will grow, shrink, and mutate in-place to reflect the latest truth of the query as changes happen to the underlying tables
* Not limited by query complexity – whether it's joins, filters, aggregates, ordering, or other constructs
* Fully supprted across:
  * databases: PostgreSQL, FlashQL, etc. (MySQL/MariaDB support coming soon)
  * runtimes and deployment models: client / server / worker / edge

This is fully covered in [Live Queries ↗](https://linked-ql.netlify.app/capabilities/live-queries) and the [Realtime Engine deep dive ↗](https://linked-ql.netlify.app/engineering/realtime-engine).

---

### 3. Streaming

`db.stream()` returns rows lazily instead of materializing the full result up front.

```js
const asyncIterable = await db.stream(`SELECT * FROM users`);

for await (const row of asyncIterable) {
  console.log(row);
}
```

#### Behavior

* Returns an async iterable
* Lazily fetches rows on demand as you iterate
* The best way to avoid materializing very large result sets in memory all at once

This is covered in [Streaming ↗](https://linked-ql.netlify.app/capabilities/streaming).

---

### 4. Transactions

`db.transaction()` provides an atomic execution boundary for one or more operations.

```js
await db.transaction(async (tx) => {

  await db.query(`INSERT INTO users (name) VALUES ('Ada')`, { tx });
  // optional additional statements

});
```

#### Behavior

* Provides an atomic execution boundary
* All operations succeed or fail together
* `tx` scopes all queries within the transaction

---

### 5. Changefeeds (WAL)

Named after PostgreSQL's Write Ahead Log (WAL), 

`db.wal.subscribe()` lets you subscribe to structured table-level changefeeds.

```js
await db.wal.subscribe({ public: ['users'] }, (commit) => {
  console.log(commit.entries);
});
```

#### Behavior

* Subscribes to structured table-level change events
* Each `commit` contains row-level mutations
* Enables reactive and event-driven workflows

See [Changefeeds (WAL) ↗](https://linked-ql.netlify.app/capabilities/changefeeds).

---

### 6. Sync (FlashQL)

`db.sync.sync()` is the API for sync in FlashQL.

You begin by defining remote data as tables (views) in your local FlashQL database. FlashQL's internal Sync Engine fulfills the contracts.

At the application level, `db.sync.sync()` is primarilly called on a network reconnect event:

```js
window.addEventListener('online', async () => {
  await db.sync.sync(); // re-sync on reconnect
});
```

#### Behavior

* Triggers the synchronization of declared views with origin tables
* Coordinates background data movement and consistency
* Designed for resilience and network instabilities

This is covered in [FlashQL Sync ↗](https://linked-ql.netlify.app/flashql/federation-and-sync).

---

### Execution Modes Summary

| Operation                  | Behavior                   |
| -------------------------- | -------------------------- |
| `db.query()`               | Materialized result        |
| `db.query(live: true)`     | Live, self-updating result |
| `db.stream()`              | Lazy-loading result        |
| `db.transaction()`         | Atomic execution           |
| `db.wal.subscribe()`       | Changefeed stream          |
| `db.sync.sync()` (FlashQL) | State synchronization      |

---

## Section 2: Language & Query Model

LinkedQL builds on standard SQL while extending it with constructs that better express modern application data patterns, relationships, and user intent.

---

### 1. JSON Literals (Structured Output)

LinkedQL allows you to construct structured objects directly in SQL.

```js
const result = await db.query(`
SELECT {
  id: u.id,
  name: u.name
} AS user
FROM users u;
```

---

#### Nested Structures

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


#### What this changes

This removes:

* manual application-level mapping logic
* repetitive transformation layers
* mismatch between backend and frontend data shapes

> The query itself defines the output

---

### 2. DeepRef Operators (Graph Traversal)

Relational queries are often written in terms of joins, but consumed as **nested graphs**.

LinkedQL introduces **DeepRef operators** to express that graph directly:

| Operator | Meaning                                |
| -------- | -------------------------------------- |
| `~>`     | forward traversal (follow a reference) |
| `<~`     | reverse traversal (find dependents)    |

---

#### Forward Traversal

```js
const result = await db.query(`
  SELECT
    id,
    parent_user ~> email AS parent_email
  FROM users;
`);
```

#### What this does

* Starts from a foreign key (`parent_user`)
* Follows it to the related row
* Reads `email` — without explicitly writing a join

---

#### Reverse Traversal

```js
const result = await db.query(`
  SELECT
    id,
    (parent_user <~ users).email AS child_email
  FROM users;
`);
```

#### What this does

* Walks “backwards” through a relationship
* Resolves rows that reference the current row

---

#### Structured Traversal

```js
const result = await db.query(`
  SELECT
    id,
    { name, email } as profile,
    parent_user ~> { id, name, email } AS parent
  FROM users;
`);
```

or:

```js
const result = await db.query(`
  SELECT {
    id,
    profile: { name, email },
    parent: parent_user ~> { id, name, email }
  } FROM users;
`);
```

#### What this changes

DeepRefs let you express queries in terms of:

> **the data graph you think in — not the join mechanics SQL requires**

This eliminates:

* join boilerplate
* alias bookkeeping
* cognitive overhead in complex queries

For deeper syntax and traversal patterns, see [DeepRefs ↗](https://linked-ql.netlify.app/capabilities/deeprefs).

---

### 3. Deep Writes (Graph Mutations)

The same syntax and relationshipal model as DeepRefs can be used for writes.

---

#### Insert with Relationships

```js
await db.query(`
  INSERT INTO users
    (email, parent_user ~> (id, email))
  VALUES
    ('ada@example.com', ROW (50, 'parent@example.com'));
`);
```

#### What this does

* Inserts the main row
* Inserts or resolves the related row
* Wires the relationship automatically – entirely in one statement

---

#### Update with Traversal

```js
await db.query(`
  UPDATE users
  SET
    email = 'ada.lovelace@example.com',
    parent_user ~> email = 'parent+updated@example.com'
  WHERE id = 1;
`);
```

---

#### What this changes

Traditional SQL requires:

* multiple statements or clever CTE tricks
* strict ordering of operations
* manual foreign-key coordination

LinkedQL keeps the statement SQL-shaped, while **relationship-aware payloads desugar into the required lower-level operations**.
See [Deep Writes ↗](https://linked-ql.netlify.app/capabilities/deeprefs).

---

### 4. Upserts (Cross-Dialect Consistency)

Upsert syntax varies across databases:

* PostgreSQL → `INSERT + ON CONFLICT`
* MySQL/MariaDB → `INSERT + ON DUPLICATE KEY`

LinkedQL provides a **single, predictable form across dialects**:

```js
await db.query(`
  UPSERT INTO users (id, name)
  VALUES (1, 'Ada')
  RETURNING id, name;
`);
```

---

#### Behavior

* Inserts if the row does not exist
* Updates if it does
* Returns consistent results across runtimes

See [UPSERT ↗](https://linked-ql.netlify.app/capabilities/upsert).

---

### 5. Version Binding (Schema Contracts)

> Available only in FlashQL. Coming soon to PostgreSQL, MySQL/MariaDB

Queries can explicitly declare the schema versions they depend on.

```js
const result = await db.query(`
  SELECT *
  FROM public.users@=3;
`);
```

---

#### With joins

```js
const result = await db.query(`
  SELECT
    u.id,
    u.name,
    p.title
  FROM public.users@=3 u
  LEFT JOIN public.posts@=5 p
    ON p.author_id = u.id;
`);
```

---

#### What this does

* Binds queries to expected schema versions
* Fails early if schema has evolved beyond expectations
* Makes schema assumptions **visible, reviewable, and enforceable** in the query itself

---

#### What this changes

Queries are implicitly written against specific schema shapes. Those assumptions fail at runtime when those schemas evolve.

LinkedQL turns those assumptions into **explicit, enforceable contracts**.
See [Version Binding ↗](https://linked-ql.netlify.app/capabilities/version-binding).

---

### Composability

These features are designed to be composable. They also deeply integrate with the existing SQL semantics. For example, DeepRefs may be used with JOINS in the same query.

---

#### Example

```js
const result = await db.query(`
  SELECT {
    id: u.id,
    name: u.name,
    post_title: p.title,
    parent: u.parent_user ~> { id, email }
  }
  FROM public.users@=3 u
  LEFT JOIN public.posts@=5 p
    ON p.author_id = u.id;
`);
```

---

## Section 3: Architecture & Orchestration

This section is about deploying LinkedQL as a system, not just calling it as an API.

Modern apps rarely have a single execution site or a single storage location.
Some queries run against PostgreSQL or MySQL on the server. Some data needs to live inside the app–the model supported by FlashQL. Some flows need edge transport. Some views should stay remote, some should be cached locally, and some should stay continuously synced.

LinkedQL is designed for these patterns.

This is where the architecture story comes in:

* where SQL executes
* where data lives
* how remote and local data meet
* how sync and reactivity fit into the same model

The scenarios below are intentionally generous. They are not just showing that something is possible; they are showing the shape of the architecture, why it is shaped that way, and what role each component plays.

### Scenario 1: Cross-Runtime Querying over HTTP

In many applications, the environment issuing queries cannot directly connect to the database.

For example, a database running on the server is often inaccessible to:

* client-side applications (running in the browser)
* applications running on the edge (on edge functions)

LinkedQL introduces a **transport protocol** that allows `db.query()` and the rest of the API surface to work across these boundaries: the **Edge Protocol**, delivered via an `EdgeClient` / `EdgeWorker` pair.

---

#### Client-side app (caller runtime)

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

#### Server-side database (execution runtime)

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
const httpWorkerEdge = EdgeWorker.httpWorker({ db: upstream });

// Now the handler (at "/api/db") that exposes the worker:
export async function POST(request) {
  const event = { request };
  return await httpWorkerEdge.handle(event);
}
```

---

#### Decoding the above

* `EdgeClient` is **not just a fetch wrapper**

* `EdgeClient` implements the same client contract as `PGClient` and `FlashQL`.
The difference is that execution happens across a transport boundary instead of locally or over a direct database connection.

* `EdgeWorker`:

  * receives protocol calls
  * maps them to a real LinkedQL client (`PGClient`, `FlashQL`, etc.)
  * and returns results in the same shape

---

#### What this solves

* Removes the need for a separate API layer for database queries
* Preserves the `db.query()` abstraction across runtime boundaries
* Avoids leaking database credentials to untrusted environments

For runtime setup details, see the [Edge Setup Guide ↗](https://linked-ql.netlify.app/docs/setup#edgeclient).

---

#### Important

This is not just a browser → server abstraction.

`EdgeClient` can be used anywhere a transport boundary exists:

* server → server
* edge → origin
* worker → worker
* browser (main thread) → web worker (as seen in Scenario 2 below)

---

### Scenario 2: Cross-Runtime Querying over Message Ports

The same protocol used over HTTP can also run over **message channels**.

A typical use case is:

* An app runs on the browser's main thread
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

#### Web Worker

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { PGClient } from '@linked-db/linked-ql/postgres';

const upstream = new PGClient({ /* config */ });
await upstream.connect();

// Automatically wires message port → LinkedQL protocol → upstream client
EdgeWorker.webWorker({ db: upstream });
```

---

#### Decoding the above

* The same LinkedQL Edge Protocol is used
* Only the **transport changes** (message ports, instead of HTTP)
* The calling code (`db.query()`) remains identical

For more on the runtime setup side, see [Dialects & Clients ↗](https://linked-ql.netlify.app/docs/setup#edge).

---

#### The Edge Protocol does the heavy lifting

As against just sending raw SQL over HTTP or message port, the client (`EdgeClient`) sends structured operations that map directly to the upstream LinkedQL client interface (e.g. `query()`, `stream()`, `subscribe()`, etc.).

This preserves:

+ execution semantics
+ result shapes
+ and advanced capabilities like live queries

---

### Scenario 3: Local-First and Offline-First Architectures

In this scenario, we demonstrate a hybrid data architecture where the goal is to:

> Query upstream data **as if it were local**, while controlling
> what stays remote, what gets cached locally, and what stays in sync.

The idea is straight-forward in FlashQL: you simply create a view (a database view) in your local database that points to the upstream database as its origin.

```js
await db.query(`
  CREATE VIEW public.users AS
  SELECT * FROM public.users
  WITH (replication_origin = '/api/db')
`);
```

Notice the `WITH (replication_origin = ...)` specifier. That's the part that turns a regular view into a foreign view.

Now, querying `public.users` on the local database will query `public.users` on the upstream database:

```js
await db.query(`
  SELECT * FROM public.users;
`);
```

Being a regular table, it can be used just like one – e.g. in joins:

```js
await db.query(`
  SELECT * FROM public.posts
  LEFT JOIN public.users ON posts.user_id = users.id;
`);
```

The query executes as one relational graph – but composed of both local and remote data.

But for this work, one thing is required:

> a way to connect the local FlashQL instance to the upstream database.

For this, the `EdgeClient` interface introduced above comes to play:

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new FlashQL({
  // The hook to remote
  async getUpstreamClient(originUrl) {
    return new EdgeClient({ url: originUrl, type: 'http' });
  }
});

await db.connect();
```

This is now a local FlashQL instance that can talk to an upstream database ondemand.

Above, the `getUpstreamClient()` factory will recieve `'/api/db'` – the value of the `replication_origin` config.

Given this as the base, FlashQL further lets you create different types of views for different replication behaviours. 

These modes determine how mirroring works; i.e. whether data stays remote, or is cached locally, or stays in sync.

| Mode                                             | Behavior                               |
| :------------------------------------------------ | :-------------------------------------- |
| Runtime views (the default) | This is the default idea of a view: a table that has no actual rows but just a query that executes at query-time. |
| Materialized views | These views go ahead to copy the origin data for local use and behave as local tables from that moment on. |
| Realtime views     | These views are materialized views that not just copy origin data, but also stay in sync with origin data. |

* use runtime views when you just want to federate remote data and don't need offline access
* use `materialized` views when you want a local copy for offline access
* use `realtime` views when the local copy should stay in sync with origin data

Each mode is demonstrated below.

---

##### Mode 1: Runtime Views (Pure Federation)

```js
await db.query(`
  CREATE VIEW public.users AS
  SELECT * FROM public.users
  WITH (replication_origin = '/api/db')
`);
```

---

###### Behaviour

* No data is stored locally
* Every query hits the remote database
* Acts as a **live window into the remote table**

This is **federation**:

> Querying external data as if it were part of your local schema

---

##### Mode 2: Materialized Views (Local Cache)

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.orders AS
  SELECT * FROM public.orders
  WITH (replication_origin = '/api/db')
`);
```

---

###### Behaviour

* Data is stored locally inside FlashQL
* It does **not update automatically**
* It must be refreshed explicitly

This is **materialization**:

This is the mode to reach for when the data should remain queryable while offline.

These views can be refreshed explicitly:

```js
await db.query(`
  REFRESH MATERIALIZED VIEW public.orders
`);
```

---

##### Mode 3: Realtime Views (Live Mirror)

```js
await db.query(`
  CREATE REALTIME VIEW public.posts AS
  SELECT * FROM public.posts
  WITH (replication_origin = '/api/db')
`);
```

---

###### Behaviour

* Data is stored locally
* Changes from the remote database are streamed in
* The local copy stays continuously updated

This is **realtime mirroring**:

* it starts with local state
* keeps that state queryable even when the app is temporarily disconnected
* and then catches up again when connectivity returns

Realtime views are designed to be resilient to network disconnects. All you need to do in
a web app, for example, is call FlashQL's `sync.sync()` API to resume work on network reconnection:

```js
window.addEventListener('online', () => {
  db.sync.sync(); // re-sync on reconnect
});
```

**`sync()`** knows how to continue from last known state.

Where still necessary, these views can be refreshed explicitly:

```js
await db.query(`
  REFRESH REALTIME VIEW public.orders
`);
```

---

#### Step 5: Querying the Unified Graph

At query time, LinkedQL builds a composed execution plan:

* runtime views are computed
* `materialized` and `realtime` views are resolved locally
* everything works as a single relational storage

```js
const result = await db.query(`
  SELECT
    u.id,
    u.name,
    o.total,
    p.title
  FROM public.users u        -- non-persistent VIEW: resolved on demand from remote DB
  LEFT JOIN public.orders o  -- materialized VIEW: served locally
    ON o.customer_id = u.id
  LEFT JOIN public.posts p   -- realtime VIEW: served locally, kept in sync
    ON p.author_id = u.id
  LEFT JOIN public.test t    -- regular table: served locally
    ON t.user_id = u.id
  ORDER BY u.id
`);
```

---

For full details, see [Federation & Sync ↗](https://linked-ql.netlify.app/flashql/federation-and-sync).

---

## LinkedQL at a Glance

| Jump to |  |
|:--|:--|
| [Getting Started ↗](https://linked-ql.netlify.app/docs) | Get started with LinkedQL in under three minutes. No database required |
| [Capabilities Overview ↗](https://linked-ql.netlify.app/capabilities) | Jump to the Capabilities section. |
| [Streaming ↗](https://linked-ql.netlify.app/capabilities/streaming) | Follow lazy result iteration and large-result usage. |
| [Changefeeds (WAL) ↗](https://linked-ql.netlify.app/capabilities/changefeeds) | Read about table-level commit subscriptions. |
| [Version Binding ↗](https://linked-ql.netlify.app/capabilities/version-binding) | Bind queries to explicit relation versions. |
| [Meet FlashQL ↗](https://linked-ql.netlify.app/flashql) | Meet FlashQL — LinkedQL's embeddable SQL engine. |
| [Federation & Sync ↗](https://linked-ql.netlify.app/flashql/federation-and-sync) | Explore the sync API and local-first orchestration path. |
| [Engineering Deep Dive ↗](https://linked-ql.netlify.app/engineering/realtime-engine) | Dig into LinkedQL's engineering in the engineering section. |

Visit the [LinkedQL documentation site ↗](https://linked-ql.netlify.app)

---

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
