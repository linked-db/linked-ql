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

_Write SQL. Run it anywhere – locally, remotely, on the edge. Go offline. Turn on live mode 🛸_<br>
LinkedQL is a database client (`client.query()`) for PostgreSQL and MySQL/MariaDB, and a unified execution model for SQL across:

server | browser | edge | local storage

Same query. Same semantics. Everywhere.

LinkedQL brings:

live queries, sync, and streams |
a modern SQL surface for relationships and JSON |
built-in schema versioning and version control system |
data federation, replication, and cross-runtime orchestration

All in under `80 KiB min | zip`.

More broadly, LinkedQL is an idea: **[SQL reimagined for modern apps ↗](https://linked-ql.netlify.app/overview)**.

</div>

---

> [!NOTE]
> You’re viewing **@linked-db/linked-ql@latest** — the newest iteration.  
> For the prev 0.3.x versions, see [linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql/tree/0.30.13).

> [!IMPORTANT]
> While still evolving, LinkedQL is already a solid system today, suitable for real-world use in controlled environments.<br>
> It is backed by **1,000+ tests and growing**, with strong coverage across **FlashQL, live queries, edge transport, federation, WAL, sync, and parser/engine behavior**.<br>
> The main areas still being expanded are **broader DDL parity, migrations, and deeper driver hardening across all environments**.

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

| **Dialect**         | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/postgres`      | [PostgreSQL ↗](https://linked-ql.netlify.app/docs/setup#postgresql) |
| MySQL               | `@linked-db/linked-ql/mysql`   | [MySQL ↗](https://linked-ql.netlify.app/docs/setup#mysql)           |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [MariaDB ↗](https://linked-ql.netlify.app/docs/setup#mariadb)       |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flashql`   | [FlashQL ↗](https://linked-ql.netlify.app/docs/setup#flashql)       |
| EdgeClient          | `@linked-db/linked-ql/edge`    | [Edge / Browser ↗](https://linked-ql.netlify.app/docs/setup#edge)   |
| EdgeWorker          | `@linked-db/linked-ql/edge-worker` | [Edge Worker ↗](https://linked-ql.netlify.app/docs/setup#edge) |

### Design Consistency Across Clients

Whatever the client you use or the storage backend, LinkedQL is the same everywhere. The following contracts, for example, hold across all database models that LinkedQL supports:

```js
// Standard SQL query
const result = await db.query('SELECT * FROM users');
console.log(result.rows); // Array of rows
```

```js
// Live queries
const liveResult = await db.query(`SELECT * FROM users`, { live: true });
console.log(liveResult.rows); // Auto-updating result rows
```

```js
// Per-table changefeeds
await db.wal.subscribe({ public: ['users'] }, (commit) => {
  console.log(commit.entries); // INSERTS/UPDATES/DELETEs
});
```

```js
// Cursor-based streaming over millions of rows
const asyncIterable = await db.stream(`SELECT * FROM users`);
for await (const row of asyncIterable) console.log(row);
```

```js
// Transactions
const result = await db.transaction(async (tx) => {
  await db.query(`CREATE TABLE users ...`, { tx });
  return await db.query(`SELECT * FROM users`, { tx });
});
```

whether `db` is:
- a PostgreSQL connection
- a local FlashQL instance
- or a remote EdgeClient

This is the LinkedQL contract:<br>
same interface, same semantics, across all environments.

But that is only the first layer of the picture.

### The Full Picture

Further down this README:

* [Section 1](#section-1-core-interface) explains the execution contract in more detail
* [Section 2](#section-2-language--query-model) shows the SQL shorthand and language extensions
* [Section 3](#section-3-architecture--orchestration) shows how local runtimes, remote runtimes, sync, and federation compose into one system

So the general shape is:

* one client interface
* one SQL mental model
* richer language affordances when you want them
* richer orchestration when the app needs local-first, edge, federation, or sync

That last orchestration layer is where FlashQL-specific capabilities such as `db.sync.sync()` come in.

---

## Why LinkedQL

Modern applications no longer interact with the database in the traditional model.

* **Frontend** needs to own data (requiring a local relational engine)
* Edge runtimes need to access the remote database
* Realtime is no longer optional
* Offline is expected

In most stacks, these concerns are handled by **dedicated tools across layers**:

* a database client,
* an API layer,
* a caching strategy,
* a dedicated sync engine,
* and a reactive layer.

Each layer introduces its own abstractions, inconsistencies, and failure modes.

The biggest problem is probably not just the tooling and layering overhead — **it's that there isn't a single execution model**.

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

The above answers:

> "What can I always expect a LinkedQL client to do, regardless of where it runs?"

Whether `db` is a direct PostgreSQL client, a local FlashQL engine, or an `EdgeClient` crossing a runtime boundary, these operations keep the same shape and the same intent.

---

### Result Model

All query executions return a consistent result object:

```js
const result = await db.query(`SELECT * FROM users`);

result.rows;     // Array of rows
```

```js
const result = await db.query(`INSERT INTO users (id) VALUES (21)`);

result.rowCount;     // Number of rows the operation spanned
```

* `rows` is always an array of plain objects
* `rowCount` (or `affectedRows`) describes the number of rows a DML operation spanned
* result shapes remain stable across execution modes

---

### Execution Options

The interface stays small on purpose.
Most capabilities are enabled by options rather than by inventing a completely different API family for each runtime or feature.

Most operations accept an optional `options` object:

```js
await db.query(sql, { live: true });
```

```js
await db.query(sql, { tx });
```

Common options:

| Option | Meaning                          |
| ------ | -------------------------------- |
| `live` | Enables reactive query results   |
| `tx`   | Binds the query to a transaction |

---

### 1. Queries

Plain `query()` is still the center of gravity.
Everything else in LinkedQL is designed to extend this familiar path rather than replace it.

```js
const result = await db.query(`
  SELECT id, name
  FROM users
  ORDER BY id
`);
```

#### What this does

* Executes a SQL query and returns a materialized result
* Supports multi-statement execution

---

### 2. Live Queries

Live queries keep a query result current over time.
You still write SQL, but the result is no longer just a one-time snapshot.

```js
const result = await db.query(`
  SELECT *
  FROM users
  ORDER BY id
`, { live: true });
```

#### What this does

* Returns a result whose `rows` are **kept up-to-date**
* The result object is stable; its contents evolve over time
* Works with joins, filters, aggregates, ordering, and other normal query structure

#### Why it matters

If the application thinks in terms of "this result should stay fresh", this is the direct primitive for that.
For the deeper model, see [Live Queries ↗](https://linked-ql.netlify.app/capabilities/live-queries) and the [Realtime Engine deep dive ↗](https://linked-ql.netlify.app/engineering/realtime-engine).

---

### 3. Streaming

Sometimes the right result is not "materialize the whole result now".
That is what `stream()` is for.

```js
const asyncIterable = await db.stream(`SELECT * FROM users`);

for await (const row of asyncIterable) {
  console.log(row);
}
```

#### What this does

* Returns an async iterable
* Lazily fetches rows on demand as you iterate
* Avoids materializing very large result sets in memory all at once

#### Why it matters

This is the right mode for exports, long scans, ETL-style work, or any query where "iterate progressively" is better than "load everything first".
See [Streaming ↗](https://linked-ql.netlify.app/capabilities/streaming).

---

### 4. Transactions

Transactions are intentionally ordinary in LinkedQL.
The point is not to invent a new transaction model; it is to preserve atomic execution across the same interface, whether the client is local, remote, or bridged across transport.

```js
await db.transaction(async (tx) => {

  await db.query(
    `INSERT INTO users (name) VALUES ('Ada')`,
    { tx }
  );

});
```

#### What this does

* Provides an atomic execution boundary
* All operations succeed or fail together
* `tx` scopes all queries within the transaction

---

### 5. Changefeeds (WAL)

The WAL API is the lower-level reactive primitive.
Use it when you care about table-level mutations themselves, not just the final query result.

```js
await db.wal.subscribe({ public: ['users'] }, (commit) => {
  console.log(commit.entries);
});
```

#### What this does

* Subscribes to structured table-level change events
* Each `commit` contains row-level mutations
* Enables reactive and event-driven workflows

#### Why it matters

This is the right primitive when you are building infrastructure, audit flows, sync adapters, or custom reactive behavior on top of raw table mutations.
See [Changefeeds (WAL) ↗](https://linked-ql.netlify.app/capabilities/changefeeds).

---

### 6. Sync

`sync()` is where LinkedQL starts moving from "client API" into "data orchestration".
It is the coordination point for materialized and realtime state, especially in FlashQL-based local-first setups.
Section 3 expands this in detail. See also [Meet FlashQL ↗](https://linked-ql.netlify.app/flashql) and [FlashQL Sync ↗](https://linked-ql.netlify.app/flashql/sync).

```js
await db.sync.sync();
```

#### What this does

* Triggers synchronization of database state
* Coordinates background data movement and consistency
* Safe to call multiple times

---

### Execution Modes Summary

The table below is the shortest way to see the contract at a glance:

| Operation               | Behavior              |
| ----------------------- | --------------------- |
| `query()`               | Materialized result   |
| `query({ live: true })` | Live result           |
| `stream()`              | Lazy-loading result   |
| `transaction()`         | Atomic execution      |
| `wal.subscribe()`       | Changefeed stream     |
| `sync.sync()` (FlashQL) | State synchronization |

---

## Section 2: Language & Query Model

LinkedQL builds on standard SQL while extending it with constructs that better express modern application data patterns, relationships, and user intent.

Traditional SQL is excellent at describing **sets of rows**.
Applications, however, operate on **structured objects, nested relationships, and evolving schemas**.

LinkedQL bridges that gap — without abandoning SQL.

All extensions are designed to **compose with existing SQL semantics**, rather than replace them.

The goal is to let SQL naturally express:

* structured data (objects, not just rows)
* relational graphs (not just joins)
* multi-entity writes (not just flat mutations)
* cross-dialect consistency
* and explicit schema assumptions

---

### Mental Model Shift

| Traditional SQL thinks in… | LinkedQL also embraces…   |
| -------------------------- | ------------------------- |
| Tables                     | Object shapes             |
| Rows                       | Structured documents      |
| Joins                      | Graph traversal           |
| Flat writes                | Relationship-aware writes |
| Implicit schema coupling   | Explicit version binding  |

You are still writing SQL — but with the ability to express **application-shaped data directly**.

---

### 1. JSON Literals (Structured Output)

LinkedQL allows you to construct structured objects directly in SQL.

```sql
SELECT {
  id: u.id,
  name: u.name
} AS user
FROM users u;
```

#### What this changes

Instead of returning flat rows and reshaping them in application code, the query itself defines the output.

> The query produces the final application-ready structure — letting you **define the final shape at query time**.

---

#### Nested Structures

```sql
SELECT {
  id: u.id,
  name: u.name,
  profile: {
    email: u.email,
    age: u.age
  }
} AS user
FROM users u;
```

#### Why this matters

Traditional SQL:

* fetch → transform → reshape

LinkedQL:

* **query → done**

This removes:

* manual mapping logic
* repetitive transformation layers
* mismatch between backend and frontend data shapes

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

```sql
SELECT
  id,
  parent_user ~> email AS parent_email
FROM users;
```

#### What this does

* Starts from a foreign key (`parent_user`)
* Follows it to the related row
* Reads `email` — without explicitly writing a join

---

#### Reverse Traversal

```sql
SELECT
  id,
  (parent_user <~ users).email AS child_email
FROM users;
```

#### What this does

* Walks “backwards” through a relationship
* Resolves rows that reference the current row

---

#### Structured Traversal

```sql
SELECT
  id,
  parent_user ~> { id, name, email } AS parent
FROM users;
```

#### Why this matters

DeepRefs let you express queries in terms of:

> **the data graph you think in — not the join mechanics SQL requires**

This eliminates:

* join boilerplate
* alias bookkeeping
* cognitive overhead in complex queries

For deeper syntax and traversal patterns, see [DeepRefs ↗](https://linked-ql.netlify.app/capabilities/deeprefs).

---

### 3. Structured Writes (Graph Mutations)

The same relationship-aware model applies to writes.

---

#### Insert with Relationships

```sql
INSERT INTO users
  (email, parent_user ~> (id, email))
VALUES
  ('ada@example.com', ROW (50, 'parent@example.com'));
```

#### What this does

* Inserts the main row
* Inserts or resolves the related row
* Wires the relationship automatically

---

#### Update with Traversal

```sql
UPDATE users
SET
  email = 'ada.lovelace@example.com',
  parent_user ~> email = 'parent+updated@example.com'
WHERE id = 1;
```

---

#### Why this matters

Traditional SQL requires:

* multiple statements or CTEs
* strict ordering of operations
* manual foreign-key coordination

LinkedQL keeps the statement SQL-shaped, while **relationship-aware payloads desugar into the required lower-level operations**.
See [Structured Writes ↗](https://linked-ql.netlify.app/capabilities/structured-writes).

---

### 4. Upserts (Cross-Dialect Consistency)

Upsert syntax varies across databases:

* PostgreSQL → `ON CONFLICT`
* MySQL → `ON DUPLICATE KEY`
* MariaDB → similar but not identical

LinkedQL provides a **single, predictable form across dialects**:

```sql
UPSERT INTO users (id, name)
VALUES (1, 'Ada')
RETURNING id, name;
```

---

#### Behavior

* Inserts if the row does not exist
* Updates if it does
* Returns consistent results across runtimes

See [UPSERT ↗](https://linked-ql.netlify.app/capabilities/upsert).

---

### 5. Version Binding (Schema Contracts)

Queries can explicitly declare the schema versions they depend on.

```sql
SELECT *
FROM public.users@=3;
```

---

#### With joins

```sql
SELECT
  u.id,
  u.name,
  p.title
FROM public.users@=3 u
LEFT JOIN public.posts@=5 p
  ON p.author_id = u.id;
```

---

#### What this does

* Binds relations to expected schema versions
* Fails early if schema has evolved beyond expectations
* Makes schema assumptions **visible, reviewable, and enforceable** in the query itself

---

#### Why this matters

Most systems rely on implicit schema assumptions that fail at runtime.

LinkedQL turns those assumptions into **explicit, enforceable contracts**.
See [Version Binding ↗](https://linked-ql.netlify.app/capabilities/version-binding).

---

### Putting It All Together

These features are designed to work together.

You can:

* traverse relationships (`~>`)
* shape structured output (`{ ... }`)
* perform nested writes
* rely on consistent upserts
* and bind to schema versions

—all within a single SQL statement.

---

#### Example

```sql
SELECT {
  id: u.id,
  name: u.name,
  parent: u.parent_user ~> {
    id,
    email
  }
}
FROM public.users@=3 u;
```

---

### Summary

LinkedQL extends SQL in a few key ways:

| Capability           | Feature           |
| -------------------- | ----------------- |
| Structured data      | JSON literals     |
| Graph queries        | DeepRef operators |
| Graph mutations      | Structured writes |
| Cross-dialect safety | Upserts           |
| Schema guarantees    | Version binding   |

---

### The Big Picture

Traditional SQL answers:

> “What rows do I want?”

LinkedQL additionally answers:

> “What shape do I want?”
> “How are entities connected?”
> “What assumptions am I making?”

—all in the same query.

This allows SQL to operate directly on **application-shaped data**, not just tables.

---

## Section 3: Architecture & Orchestration

This section is about deploying LinkedQL as a system, not just calling it as an API.

Modern apps rarely have a single execution site or a single storage location.
Some queries run against PostgreSQL or MySQL on the server. Some data needs to live inside the app. Some flows need edge transport. Some views should stay remote, some should be cached locally, and some should stay continuously synced.

LinkedQL is designed to let those choices vary without forcing the application into separate query models.

This is where the architecture story comes in:

* where SQL executes
* where data lives
* how remote and local data meet
* how sync and reactivity fit into the same model

The scenarios below are intentionally generous. They are not just showing that something is possible; they are showing the shape of the architecture, why it is shaped that way, and what role each component plays.

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
See [FlashQL Overview ↗](https://linked-ql.netlify.app/flashql).

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

* `FlashQL` is not a mock store — it is a **full relational engine**
* It implements the same query contract as `PGClient`
* Execution is entirely **local**

FlashQL brings:

* MVCC-based transactions (similar to PostgreSQL's MVCC architecture)
* WAL-backed change tracking (similar to PostgreSQL's Write-Ahead Log (WAL))
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

without introducing a second query language or API.

---

### Scenario 3: Cross-Runtime Querying over HTTP

In many applications, the environment issuing queries cannot directly connect to the database.

For example, a database running on the server is often inaccessible to:

* client-side applications (running in the browser)
* applications running on the edge (on edge functions)

LinkedQL introduces a **transport protocol** that allows `db.query()` to work across these boundaries: the **Edge Protocol**, delivered via an `EdgeClient` / `EdgeWorker` pair.

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
const worker = new EdgeWorker({ client: upstream });

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

The above in a [Webflo](https://github.com/webqit/webflo) application would look like the following:

<details>
<summary>Show code</summary>

```js
export async function POST(event, next) {
    //await event.user.signIn();
    if (next.stepname) return await next();

    const op = event.url.query.op;
    const args = await event.request.json();


    return await worker.handle(op, args, event.client, () => {
        event.waitUntil(new Promise(() => { }));
    }) || {}; // Always return something to prevent being a 404
}
```

</details>

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

For runtime setup details, see [Dialects & Clients ↗](https://linked-ql.netlify.app/docs/setup#edge).

---

#### Important

This is not just a browser → server abstraction.

`EdgeClient` can be used anywhere a transport boundary exists:

* server → server
* edge → origin
* worker → worker
* browser (main thread) → web worker (as seen in Scenario 4 below)

---

### Scenario 4: Cross-Runtime Querying over Message Ports

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
EdgeWorker.webWorker({ client: upstream });
```

---

#### Decoding the above

* The same LinkedQL Edge Protocol is used
* Only the **transport changes** (message ports, instead of HTTP)
* The calling code (`db.query()`) remains identical

For more on the runtime setup side, see [Dialects & Clients ↗](https://linked-ql.netlify.app/docs/setup#edge).

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

At a high level, this system works like this:

- You define **where data comes from** (local vs remote)
- You define **how it is stored** (none, cached, or realtime)
- LinkedQL ensures everything behaves like a single database

The idea starts with the local database – this time, instantiated with a hook to the remote database.

```js
const db = new FlashQL({
  // The hook to remote
  async onCreateForeignClient() {
    return new EdgeClient({ url: '/api/db', type: 'http' });
  }
});

await db.connect();

// The queries
// which can span local and remote tables
await db.query(`
  SELECT * FROM remote.users
`);
```

This query may:

- hit a remote database,
- use a local replica,
- or combine both

But it always behaves like a single SQL query.

The system is introduced step by step below. Much of that is mere configurations.

---

#### Step 1: Connect a Local Engine to a Remote Origin

We start with FlashQL as our local database.

Then we teach it how to reach a remote database when needed.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

// The local database
const db = new FlashQL({

  // Called whenever a query references a foreign origin and needs a client
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
* `"primary"` is simply the name we want to give to a **remote database**. (FlashQL lets the origin details be application-defined. It can be a bare identifier as used here, or a URL, or something else.)
* `EdgeClient` is how FlashQL will talk to that remote system

At this point:

* nothing is mirrored yet
* no data is fetched
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
    replication_origin: 'primary', // The value passed to onCreateForeignClient()

    // Indicates how to reach it (via EdgeClient)
    replication_origin_type: 'edge',
  });

});
```

---

##### Decoding the above

* The programmatic `tx.createNamespace()` call above is equivalent to `db.query('CREATE SCHEMA remote')`, but it lets us add the concept of **foreign origin**
* `remote` is a **real local namespace (schema)** that can have tables and views (`VIEWS`) just like a regular namespace
* The difference is what happens when you create a view inside it: those views will automatically resolve from the remote origin instead of the local database

Think of the **views** + **foreign origin** combination as the way to mirror remote data sources.

We move on to that part now.

---

#### Step 3: Let’s Mirror Foreign Tables Locally

Now we create **views** that mirror foreign tables.

LinkedQL provides **three mirroring modes**:

| Mode                                             | Behavior                               |
| ------------------------------------------------ | -------------------------------------- |
| Views defined as: `persistence="origin"`       | These views don't copy the remote data locally; they simply act as local references to remote data – resolved at query-time. These are called "origin views" |
| Views defined as: `persistence="materialized"` | These views copy the remote data locally and behave as local tables from that moment on; cached data is refreshed manually. These are called "materialized views" |
| Views defined as: `persistence="realtime"`     | These views copy the remote data locally and behave as local tables from that moment on; **but most notably, local data is kept in sync with remote data**. These are called "realtime views" |

In short:

- `origin`       → data always remote
- `materialized` → data cached locally (with optional manual refresh)
- `realtime`     → data cached locally and continuously synced

Those three modes are the heart of the local-first story:

* use `origin` when freshness matters more than offline access
* use `materialized` when you want a local cache you can refresh deliberately
* use `realtime` when the local copy should stay warm automatically after initial sync

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

This is the lightest-weight mode. It gives you unification without local storage cost.

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

This is the mode to reach for when:

* the dataset is expensive to fetch repeatedly
* it should remain queryable while offline
* and "fresh on demand" is good enough

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

> A local table that tracks and syncs with the remote table over time

Notice from the above that `view_spec` for any of the modes can be any SQL query, as against just a `namespace → name` declaration.

This is the richest mode:

* it starts with local state
* keeps that state queryable even when the app is temporarily disconnected
* and then catches up again when connectivity returns

---

#### Step 4: Running Sync

On having defined the views, you activate the synchronization via:

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

First: **the initial call after defining views**:

```js
await db.sync.sync();
```

Second: **the optional app-level wiring to the network signal switch:**

```js
window.addEventListener('online', () => {
  db.sync.sync(); // re-sync on reconnect
});
```

At that point, your local database is no longer just "configured".
It is now hydrated, subscribed where necessary, and ready to behave like a unified relational graph.

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
* `remote.orders` → served from the local cache created by materialization
* `remote.posts` → served locally, then kept hot by realtime sync
* `public.test` → an ordinary local table with no remote involvement
* The planner treats all of them as one relational graph even though they come from different storage modes

This is the key architectural promise of LinkedQL:

> You choose data placement and sync policy per relation, but you still query the result as one database.

For the FlashQL side of this model, see [Federation & Sync ↗](https://linked-ql.netlify.app/flashql/foreign-io) and [FlashQL Sync ↗](https://linked-ql.netlify.app/flashql/sync).

---

## LinkedQL at a Glance

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

### Capabilities

| Capability                    | Description                                                                                                                    |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Live Queries**            | Turn on reactivity over SQL with `{ live: true }`, including joins, aggregates, ordering, and windowed result updates. |
| 🔗 **DeepRef Operators**      | Traverse relationships using simple path notation (`~>` / `<~`). Insert or update nested structures using the same syntax. |
| 🧩 **JSON Literals**          | Bring JSON-like clarity to SQL with first-class support for JSON notation and object-shaped payloads. |
| 🪄 **Upserts**                | Use a literal UPSERT statement and familiar conflict-handling flows across supported runtimes. |
| 🧠 **Version Binding**        | Bind queries to expected relation versions so an app can fail fast when storage shape no longer matches assumptions. |
| 💾 **Edge & Offline Runtime** | Run or embed SQL locally in FlashQL — in browsers, workers, or edge devices — with persistence and replay. |
| 🌐 **Federation & Sync**      | Unify remote databases and local stores into a single relational graph with materialized and realtime synced views. |

### Features

| Feature                                   | Description                                                                                             |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| 💻 **Classic `client.query()` Interface** | Same classic client interface, with advanced capabilities for modern applications. |
| 🔗 **Multi-Dialect Support**              | A universal parser that understands PostgreSQL, MySQL, MariaDB, and FlashQL — one client, many dialects.           |
| 💡 **Lightweight Footprint**              | A full reactive data layer in one compact library — under 80 KiB (min/zip). |
| 🎯 **Automatic Schema Inference**         | No upfront schema work. LinkedQL auto-discovers your schema and stays schema-driven across complex tasks.      | 
| 🧱 **Embeddable Storage Engine**          | FlashQL brings MVCC, WAL persistence, selectors, views, sync metadata, and replay into an embeddable engine. |
| 🛰️ **Realtime + Sync Pipeline**           | Local materialized and realtime views can be refreshed and resumed through a single sync entry point. |
| 🪄 **Diff-Based Migrations**              | Planned: evolve schemas declaratively through change detection instead of hand-written migration scripts.        |

### Architectural Strengths

| Strength | Description |
| :-- | :-- |
| **MVCC Storage Model (FlashQL)** | FlashQL is built around transactional MVCC semantics rather than mutable in-place state. |
| **Transaction-First API** | Query, stream, live query, edge transport, and explicit transaction flows all align around transactional execution. |
| **Views As Primitives (FlashQL)** | `origin`, `materialized`, and `realtime` views are first-class building blocks, not bolted-on adapters. |
| **Modern WAL API** | `client.wal.subscribe(...)` gives app-facing changefeed consumption without forcing raw database replication ergonomics into the UI layer. |
| **Concurrency & Replay (FlashQL)** | WAL persistence, replay, catch-up, and conflict-aware storage behavior make local-first flows practical instead of purely optimistic. |
| **Version Binding** | Queries can assert the relation versions they were designed against and fail fast if app assumptions drift from storage. |

## Documentation

Visit the [LinkedQL documentation site ↗](https://linked-ql.netlify.app)

| Jump to |  |
|:--|:--|
| [Getting Started ↗](https://linked-ql.netlify.app/docs) | Get started with LinkedQL in under three minutes. No database required |
| [Capabilities Overview ↗](https://linked-ql.netlify.app/capabilities) | Jump to the Capabilities section. |
| [Streaming ↗](https://linked-ql.netlify.app/capabilities/streaming) | Follow lazy result iteration and large-result usage. |
| [Changefeeds (WAL) ↗](https://linked-ql.netlify.app/capabilities/changefeeds) | Read about table-level commit subscriptions. |
| [Version Binding ↗](https://linked-ql.netlify.app/capabilities/version-binding) | Bind queries to explicit relation versions. |
| [Meet FlashQL ↗](https://linked-ql.netlify.app/flashql) | Meet FlashQL — LinkedQL's embeddable SQL engine. |
| [FlashQL Sync ↗](https://linked-ql.netlify.app/flashql/sync) | Explore the sync API and local-first orchestration path. |
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
