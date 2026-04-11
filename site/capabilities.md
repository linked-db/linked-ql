# Capabilities

LinkedQL collapses the traditional data stack — database, API layer, and sync engine — into a single SQL primitive that drops directly into your application.

This page breaks that system down into its core capabilities:

* **At the language level**: LinkedQL's richer syntax for relationships, structure, and more
* **At the system level**: live queries, streaming, changefeed, and more
* **At the integration and architecture level**: cross-runtime, local-first, offline-first architectures

## At a Glance

Ahead of the sections below, here's your map to the capability pages.

For language-level capabilities:

* [DeepRefs](/capabilities/deeprefs)
* [JSON Literals](/capabilities/json-literals)
* [UPSERT](/capabilities/upsert)

For runtime-level capabilities:

* [Live Queries](/capabilities/live-queries)
* [Streaming](/capabilities/streaming)
* [Changefeeds](/capabilities/changefeeds)

For runtime & distribution:

* [FlashQL](/flashql)
* [Federation, Materialization, and Sync](/flashql/federation-and-sync)
* [LinkedQL Integration Patterns](/docs/integration-patterns)

## Language Capabilities

LinkedQL brings structure and relationships directly into SQL.

Instead of flattening data and reshaping it in application code, you express the final structure directly in the query.

### Meet JSON Literals (Inline Structuring)

```js
const result = await db.query(`
  SELECT
    id,
    { first: first_name, last: last_name } AS name,
    { email, phone: phone_number } AS contact
  FROM users
`);
```

No mapping layer. No post-processing.

* the query returns exactly the shape your UI needs
* no `map()` / `reduce()` / DTO transformation step
* fewer mismatches between backend and frontend models

### Meet DeepRefs (Inline Relationships)

```js
const posts = await db.query(`
  SELECT
    title,
    author ~> {
      id,
      name,
      profile ~> { avatar_url }
    } AS author
  FROM posts
  WHERE published = true
`);
```

No need for an ORM or manual JOIN logic.

If you've defined foreign key relationships in your tables, you can traverse them directly.

The above expresses the data the way the application already understands it:

* a post has an author
* an author has a profile

### Documentation

| Capability        | What It Adds                         | Docs                                         |
| :---------------- | :----------------------------------- | :------------------------------------------- |
| **DeepRefs**      | Direct relationship traversal in SQL | [DeepRefs](/capabilities/deeprefs)           |
| **JSON Literals** | Direct structuring in SQL            | [JSON Literals](/capabilities/json-literals) |
| **UPSERT**        | A direct UPSERT statement in SQL     | [UPSERT](/capabilities/upsert)               |

---

## Execution Capabilities

LinkedQL is built to extend what the host database itself can do—without requiring database-specific extensions.

On any given database, LinkedQL lets you have live queries as a first-class capability, and directly supports streaming and table-level subscriptions.

### Meet Live Queries

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

No need for dedicated GraphQL servers in front of your database. Your query is the subscription.

`result` is the same shape as a regular query result but self-updating as the database changes over time.

Updates are pushed from the database to the client—no polling, no manual subscriptions:

* automatically stays current over time
* directly powers reactivity across the app

### Meet Changefeeds (Direct Table-Level Subscriptions)

```js
const unsubscribe = await db.wal.subscribe({ public: ['users'] }, (commit) => {
  console.log(commit);
});
```

Sometimes, table-level changes are the target.

`db.wal.subscribe()` exposes commit-level events from the underlying database change streams:

* PostgreSQL's Write Ahead Log (WAL)
* MySQL/MariaDB's Binary Log (Binlog)
* FlashQL's Write Ahead Log (WAL)

It's especially useful for replication flows, synchronization logic, and downstream processors.

### Documentation

| Capability       | What It Adds                              | Docs                                       |
| :--------------- | :---------------------------------------- | :----------------------------------------- |
| **Live Queries** | Queries that stay current as data changes | [Live Queries](/capabilities/live-queries) |
| **Streaming**    | Incremental row delivery                  | [Streaming](/capabilities/streaming)       |
| **Changefeeds**  | Commit-level event streams                | [Changefeeds](/capabilities/changefeeds)   |

---

## Integration, Architecture, and Sync

LinkedQL extends SQL beyond a single runtime.

Queries can run locally, remotely, or across both — while preserving the same interface.

Applications that span network and protocol boundaries get a single interface to:

* run a database locally (in the browser, worker, edge)
* connect to upstream databases across boundaries
* federate and synchronize state across nodes

The application keeps the same `db.query()` contract in all cases—regardless of where it runs.

### Meet FlashQL

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

await db.query(`
  CREATE TABLE public.users (
    id INT PRIMARY KEY,
    name TEXT
  );

  INSERT INTO public.users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus');
`);

const result = await db.query(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);

console.log(result.rows);
// [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }]

await db.disconnect();
```

Spin up a FlashQL instance in any JavaScript runtime: the browser, the edge, or a worker.

`FlashQL` brings the full relational engine into the application runtime, powering:

* local-first and offline-first architectures
* data federation and sync across local/remote boundaries

FlashQL runs a transaction-first, Multi-Version Concurrency Control architecture (MVCC)—like PostgreSQL.

### Meet the EdgeClient

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

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

`EdgeClient` preserves the LinkedQL contract across runtime boundaries.

The data lives in a remote runtime, but your application sees the same SQL interface—no change in how queries are written or consumed:

* live queries
* inline relationships
* sync, etc.

### Meet Federation and Sync

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new FlashQL({
  getUpstreamClient: () =>
    new EdgeClient({ url: '/api/db', type: 'http' }),
});
await db.connect();

await db.query(`
  CREATE REALTIME VIEW store.orders AS
  SELECT * FROM public.orders
  WITH (replication_origin = 'postgres://db.url.com')
`);
```

FlashQL takes you beyond local storage to tie in any number of upstream data sources.

The realtime view above behaves like a local table:

* queries read from local state
* updates are applied asynchronously from upstream
* writes can be synchronized back upstream

You keep one SQL surface for reads and writes, plus gain:

* federation across runtime and network boundaries
* local retention and offline reads
* automatic inbound sync through the realtime view

### Documentation

| Capability                                | What It Adds                            | Docs                                                                  |
| :---------------------------------------- | :-------------------------------------- | :-------------------------------------------------------------------- |
| **FlashQL**                               | Embedded SQL runtime                    | [FlashQL](/flashql)                                                   |
| **Federation, Materialization, and Sync** | Queries spanning local and remote data  | [Federation, Materialization, and Sync](/flashql/federation-and-sync) |
| **LinkedQL Integration Patterns**         | One database contract across boundaries | [LinkedQL Integration Patterns](/docs/integration-patterns)           |
