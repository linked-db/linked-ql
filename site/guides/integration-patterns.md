# LinkedQL Integration Patterns

LinkedQL is designed to map directly to modern application architectures.

Instead of introducing separate systems for APIs, caching, synchronization, and local state, LinkedQL composes these concerns from a small set of primitives.

This page shows how those primitives combine into common integration patterns:

- direct database access
- cross-runtime access over a boundary
- local-first architectures with synchronization
- worker-isolated and multi-context setups

All patterns preserve the same database interface.

---

## Baseline: Direct Database Access

Most applications start with a direct connection to a database:

> **App → Database**

This is the conventional model where:

- the application and database run in reachable environments
- queries are executed directly over a native protocol

LinkedQL supports this through:

- `PGClient`
- `MySQLClient`
- `MariaDBClient`

```js
import { PGClient } from '@linked-db/linked-ql/postgres';

const db = new PGClient({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await db.connect();

const result = await db.query(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);
```

---

## When a Runtime Boundary Exists

As soon as your application crosses runtime boundaries, the problem changes.

Examples:

- the app runs in the browser, but the database is remote  
- the app needs to function offline  
- data must be shared across tabs, workers, or edge runtimes  

At this point, the challenge is no longer just querying.

It becomes:

- moving the database interface across boundaries  
- optionally running a database locally  
- synchronizing state between local and upstream systems  

LinkedQL addresses this with two primitives:

- **`EdgeClient` ↔ `EdgeWorker`** — for crossing runtime or protocol boundaries  
- **`FlashQL`** — for running a database locally  

These primitives can be used independently or composed into larger architectures.

---

## Core Primitives

All patterns are composed from these two primitives:

- **`EdgeClient` ↔ `EdgeWorker`**  
  These represent two ends of a transport protocol. `EdgeClient` is the application-facing side of the boundary, and `EdgeWorker` is the runtime side that exposes a database over that boundary. (Full details in [Edge](/guides/edge)).

- **`FlashQL`**  
  The embedded database that enables local-first storage, sync, and federation when the database itself needs to live inside the application runtime. (Full details in [FlashQL](/flashql), [Federation, Materialization, and Sync](/flashql/federation-and-sync)).

Should you be new to the overall system, it helps to read this page alongside [What Is LinkedQL](/overview), [Guides](/guides), [Language](/lang), and [Realtime](/realtime).

---

## The Patterns By Use Case

Choose your starting pattern based on the shape of your application:

- Need remote database access only  

  → **Pattern A: EdgeClient → Backend**  
  ([Jump to section](#pattern-a-edgeclient--backend))

- Need local-first / offline-first behavior  

  → **Pattern B: FlashQL → Backend**  
  ([Jump to section](#pattern-b-flashql--backend))

- Need local-first + worker isolation or multi-tab support  

  → **Pattern C: EdgeClient → FlashQL (Worker) → Backend**  
  ([Jump to section](#pattern-c-edgeclient--flashql-worker--backend))

These patterns are composable—you can evolve from one to another without changing your application’s data model.

The patterns differ mainly in where the database lives, where the app lives, and whether the data layer must cross runtime boundaries, persist locally, or synchronize with upstream state.

---

## Pattern A: `EdgeClient → Backend`

This is the **remote-first** pattern:

> the application runs in one runtime, such as the browser, edge, or another process. The database lives remotely

The [EdgeClient](/guides/edge) and [EdgeWorker](/guides/edge) pair gives you the full LinkedQL contract across the boundary.

### On the Application Side

`EdgeClient` serves as the database your application sees:

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  url: '/api/db',
  type: 'http',
});
```

```js
const result = await db.query(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);
```

### On the Backend

You setup your database and expose it to `EdgeClient`:

```js
import { PGClient } from '@linked-db/linked-ql/postgres';
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const db = new PGClient({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await db.connect();

const worker = EdgeWorker.httpWorker({ db });
```

You handle incoming operations in the specified route – `/api/db`:

```js
export async function POST(request) {
  const event = { request };
  return await worker.handle(event);
}
```

### What Happens Across the Boundary

* `EdgeClient` forwards database operations
* `EdgeWorker` executes them against the upstream database
* results are returned in the same shape as a local client

### Streaming Support Across the Boundary

Streaming works transparently across the Boundary:

```js
const asyncIterable = await db.stream(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);

for await (const row of asyncIterable) {
  console.log(row);
}
```

### Live Queries Support Across the Boundary

Live queries work transparently across the Boundary:

```js
const liveResult = await db.query(`
  SELECT id, name FROM public.users
`, { live: true });
```

For these capabilities, see the [Edge guide](/guides/edge) for how backend capabilities map to protocol support.

---

## Pattern B: `FlashQL → Backend`

This is the **local-first** pattern:

> the database lives within the app or together in the same runtime. The server-side database becomes an upstream source of truth, replication partner, or synchronization peer.

This distribution model fits modern apps that need local reads, local writes, resilience to network loss, or a database that can keep functioning while connectivity comes and goes.

### On the Application Side

[FlashQL](/flashql) becomes the actual database the application talks to. The upstream database optionally becomes an extension of the local database and the source of truth.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new FlashQL({
  getUpstreamClient: () =>
    new EdgeClient({ url: '/api/db', type: 'http' }),
});

await db.connect();
```

### Setting Up Sync

You optionally want remote data as local tables – either as normal database views, materialized views, or realtime views. (Fully covered in [Federation, Materialization, and Sync](/flashql/federation-and-sync))

```js
await db.query(`
  CREATE REALTIME VIEW public.users AS
  SELECT * FROM public.users
  WITH (
    replication_origin = 'postgres:primary',
    write_policy = 'local_first'
  )
`);
```

### What This Enables

* local querying and indexing
* local writes
* realtime synchronization
* conflict-aware sync
* one SQL surface for all data

### Sync Lifecycle

The application model stays small:

* you define remote data as local tables (views)
* [FlashQL](/flashql) handles replication
* on reconnect, you call [`db.sync.sync()`](/flashql/sync-api)

```js
window.addEventListener('online', async () => {
  await db.sync.sync();
});
```

---

## Pattern C: `EdgeClient → FlashQL (Worker) → Backend`

This pattern keeps the **local-first database in a separate worker runtime**.

The distribution model here is more layered:

> the UI lives in one runtime, the local database lives in a worker, and the upstream database still lives remotely behind another boundary.

This is the pattern for applications that want local-first behavior, but also want to isolate database work from the main thread, centralize coordination, or share a worker-hosted [FlashQL](/flashql) runtime across execution contexts.

### Effective Execution Chain

`UI EdgeClient → Worker EdgeWorker → FlashQL → Upstream EdgeClient → Backend EdgeWorker → Database`

The UI still sees a single `db`.

This pattern composes the [Edge transport layer](/guides/edge) with [FlashQL](/flashql) and its [sync model](/flashql/federation-and-sync).

---

## Pattern C1: Dedicated Worker

This is the **per-tab worker-local** variant:

> each tab gets its own worker and its own local database runtime.

That usually fits applications where isolation is preferred and cross-tab sharing is less important than keeping the UI thread free while still preserving the same [EdgeClient](/guides/edge) contract in the UI.

### On the UI

`EdgeClient` serves as the database your application sees:

```js
const db = new EdgeClient({
  url: './db.worker.js',
  type: 'worker',
});
```

### In the Web Worker

`FlashQL` runs as the whole database or the first upstream database:

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

EdgeWorker.webWorker({
  db: new FlashQL({
    getUpstreamClient: () =>
      new EdgeClient({ url: '/api/db', type: 'http' }),
  }),
});
```

---

## Pattern C2: Shared Worker

This is the **shared worker-local** variant:

> multiple tabs talk to one worker-hosted database for the origin.

That distribution model is often the better fit when multi-tab state should stay aligned, synchronization should be centralized, and one shared [FlashQL](/flashql) instance is more useful than several isolated ones.

### On the UI

`EdgeClient` serves as the database your application sees:

```js
const db = new EdgeClient({
  url: './db.js',
  type: 'shared_worker',
});
```

### In the Shared Worker

`FlashQL` runs as the whole database or the first upstream database:

```js
EdgeWorker.sharedWorker({
  db: new FlashQL({
    getUpstreamClient: () =>
      new EdgeClient({ url: '/api/db', type: 'http' }),
  }),
});
```

### Why Shared Worker Is Often Ideal

* one database per origin
* consistent multi-tab state
* centralized sync
* reduced duplication of subscriptions

---

## Choosing a Pattern

Start with:

* **Pattern A** if you only need remote access and want [EdgeClient](/guides/edge) to preserve the app-facing contract
* **Pattern B** if local-first is core to your product and [FlashQL sync](/flashql/federation-and-sync) is part of the design
* **Pattern C** if you need local-first plus worker isolation or multi-tab coordination

All patterns preserve the same database interface, so your application code remains stable as architecture evolves.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the common LinkedQL guide | [Guides](/guides) |
| the common API contract | [API](/api) |
