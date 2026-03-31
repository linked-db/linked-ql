<div align="center">

# LinkedQL  

One SQL interface for local, remote, and live data

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

→ one application-level interface in all  
→ under `80 KiB` (min+zip) in all

> One SQL interface for local, remote, and live data

The big picture? **[SQL, reimagined for modern apps ↗](https://linked-ql.netlify.app/overview)**.

</div>

---

> [!IMPORTANT]
> LinkedQL is backed by **over 1,000 test cases and growing**.<br>
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

| **Dialect**         | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/postgres`      | [PostgreSQL ↗](https://linked-ql.netlify.app/docs/setup#postgresql) |
| MySQL               | `@linked-db/linked-ql/mysql`   | [MySQL ↗](https://linked-ql.netlify.app/docs/setup#mysql)           |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [MariaDB ↗](https://linked-ql.netlify.app/docs/setup#mariadb)       |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flashql`   | [FlashQL ↗](https://linked-ql.netlify.app/docs/setup#flashql)       |
| EdgeClient          | `@linked-db/linked-ql/edge`    | [Edge / Browser ↗](https://linked-ql.netlify.app/docs/setup#edge)   |
| EdgeWorker          | `@linked-db/linked-ql/edge-worker` | [Edge Worker ↗](https://linked-ql.netlify.app/docs/setup#edge) |

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

* a transaction-first, MVCC architecture (similar to PostgreSQL's MVCC architecture)
* WAL-backed change tracking (similar to PostgreSQL's Write-Ahead Log (WAL))
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

For result shapes, options, and API detail, see the [Query API docs ↗](https://linked-ql.netlify.app/docs/query-api).

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
* The best way to avoids materializing very large result sets in memory all at once

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

You begin by creating views and pointing them to local or remote tables. You call `sync()` to execute the contract.

```js
await db.sync.sync();
```

#### Behavior

* Triggers the synchronization of declared views with origin tables
* Coordinates background data movement and consistency
* Designed for resilience and network instabilities

This is covered in [FlashQL Sync ↗](https://linked-ql.netlify.app/flashql/sync).

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

### 3. Structured Writes (Graph Mutations)

The same relationship-aware model applies to writes.

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
* Wires the relationship automatically

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

* multiple statements or CTEs
* strict ordering of operations
* manual foreign-key coordination

LinkedQL keeps the statement SQL-shaped, while **relationship-aware payloads desugar into the required lower-level operations**.
See [Structured Writes ↗](https://linked-ql.netlify.app/capabilities/structured-writes).

---

### 4. Upserts (Cross-Dialect Consistency)

Upsert syntax varies across databases:

* PostgreSQL → `INSERT + ON CONFLICT`
* MySQL → `INSERT + ON DUPLICATE KEY`
* MariaDB → similar but not identical

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

### The Big Picture: Better Mental Models

Traditional SQL answers:

> “What rows do I want?”

LinkedQL **additionally** answers:

> “What shape do I want?”
> “How are entities connected?”
> “What assumptions am I making?”

—all in the same query.

This allows SQL to operate directly on **application-shaped data**, not just tables.

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

### Scenario 3: Local-First and Offline-First Architectures

In this scenario, we demonstrate a hybrid data architecture where the goal is to:

> Query remote data **as if it were local**, while controlling
> what stays remote, what gets cached locally, and what stays in sync.

This is where LinkedQL moves beyond “client” and becomes a **data architecture layer**.

At a high level, this system works like this:

- You define **where data comes from** (local vs remote)
- You define **how it is stored** (none, cached, or synced)
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

The system is introduced step by step below. Much of that is mere configuration.

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

Next, we create a schema – more specifically called a "namespace" in FlashQL – with the foreign origin behaviour.

```js
await db.query(`
  CREATE SCHEMA remote
  WITH (replication_origin = 'primary')
`);
```

This namespace will be able to incorporate data from a foreign origin tagged here as "primary". The result of `onCreateForeignClient()`
will be the foreign client interface.

---

##### Decoding the above

* FlashQL is your **local database**
* `remote` schema is a **regular schema (namespace)** that can have tables and views (`VIEWS`)
* `replication_origin` is a setting that extends the behaviour of the namespace to include objects from a foreign origin
* the value: `"primary"` is a custom identifier for this **remote database**. (FlashQL lets the origin details be anything: an identifier, a URL, a database connection string, etc.)
* `EdgeClient` – the result of `onCreateForeignClient()` – is how FlashQL will talk to that remote system

At this point:

* nothing is mirrored yet
* no data is fetched
* we’ve only defined **how to reach the remote** from the local

But the local namespace by itself is ready for use as normal. You can create tables as necessary:

```js
// FlashQL accepts multiple statements in a single call
await db.query(`
  -- Define tables explicitly
  CREATE TABLE remote.users (
    id INT PRIMARY KEY,
    name TEXT
  );

  -- Seed local data
  INSERT INTO remote.users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus');
`);
```

But the containers of foreign data will not be tables. They will be views (VIEWS).

Think of views as table-like objects whose contents come from other tables – whether local tables or remote tables.

---

#### Step 2: Let’s Mirror Foreign Tables Locally

A view created inside a namespace with `replication_origin`, like the above, automatically resolves its data from the foreign origin.

```js
await db.query(`
  CREATE VIEW remote.users AS
  SELECT * FROM public.users
`);
```

Rows in this view (`remote.users`) will mirror `public.users` in foreign origin. The persistence of this data is configurable.

FlashQL supports **three persistence modes**. These modes determine how mirroring works; i.e. whether data stays remote, or is cached locally, or stays in sync.

| Mode                                             | Behavior                               |
| :------------------------------------------------ | :-------------------------------------- |
| `persistence="none"`(the default) | Views set to this mode don't copy the remote data locally; they simply act as local references to remote data. These are called "non-persistent views" |
| `persistence="materialized"` | Views set to this mode copy the origin data locally and behave as local tables from that moment on; cached data is refreshed manually. These are called "materialized views" |
| `persistence="realtime"`     | Views set to this mode copy the remote data locally and behave as local tables from that moment on; **but most notably, local data is kept in sync with origin data**. These are called "realtime views" |

* use `none` when freshness matters more than offline access
* use `materialized` when you want a local cache you can refresh deliberately
* use `realtime` when the local copy should stay warm automatically after initial sync

Each mode is demonstrated below.

---

##### Mode 1: Non-Persistent Views (Pure Federation)

```js
await db.query(`
  CREATE VIEW remote.users AS
  SELECT * FROM public.users
`);
```

---

###### Behaviour

* No data is stored locally
* Every query hits the remote database
* Acts as a **live window into the remote table**

This is **federation**:

> Querying external data as if it were part of your local schema

This is the lightest-weight mode. It gives you unification without local storage cost.

---

##### Mode 2: Materialized Views (Local Cache)

```js
await db.query(`
  CREATE MATERIALIZED VIEW remote.orders AS
  SELECT * FROM public.orders
`);
```

---

###### Behaviour

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
await db.query(`
  CREATE REALTIME VIEW remote.posts AS
  SELECT *
  FROM public.posts
  WHERE post_type = 'NEWS'
`);
```

---

###### Behaviour

* Data is stored locally
* Changes from the remote database are streamed in
* The local copy stays continuously updated

This is **realtime mirroring**:

> A local table that tracks and syncs with the remote table over time

This is the richest mode:

* it starts with local state
* keeps that state queryable even when the app is temporarily disconnected
* and then catches up again when connectivity returns

---

#### Step 3: Running Sync

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
* **Resumable** → knows hot to continue from last known state
* **Network-aware** → designed for reconnect flows

##### Typical usage:

First: **the initial call after defining views**:

```js
await db.sync.sync();
```

Second: **the optional wiring to the app-level network signal:**

```js
window.addEventListener('online', () => {
  db.sync.sync(); // re-sync on reconnect
});
```

At that point, your local database is no longer just "configured".
It is now hydrated, subscribed where necessary, and ready to behave like a unified relational graph.

> Note that the initial `db.sync.sync()` can be automatically-handled by FlashQL. Simply pass `autoSync: true` in constructor parameters:
>
> `new FlashQL({ autoSync: true });`

---

#### Step 5: Querying the Unified Graph

At query time, LinkedQL builds a composed execution plan:

* non-persistent views are resolved on demand
* `materialized` and `realtime` views are resolved locally
* results are merged into a single relational execution

```js
const result = await db.query(`
  SELECT
    u.id,
    u.name,
    o.total,
    p.title
  FROM remote.users u        -- non-persistent VIEW: resolved on demand from remote DB
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
