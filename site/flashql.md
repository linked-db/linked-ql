# FlashQL

FlashQL is LinkedQL's embeddable SQL runtime.

It lets you run a real query engine inside:

- the browser
- Node.js
- workers
- edge runtimes

And it does more than "local SQL in memory." FlashQL combines:

- a local storage engine
- SQL parsing and execution
- live queries
- WAL/changefeed access
- foreign-client federation
- local-first sync orchestration
- point-in-time boot with version-aware replay

If LinkedQL is the broad cross-runtime data interface, FlashQL is the place where the full local-first story comes together.

## What FlashQL is good at

FlashQL is especially strong when you need one or more of these:

- a SQL runtime inside an app, worker, or edge process
- a local-first data layer with persistent local state
- the ability to query local and remote relations through one graph
- live queries over local state
- explicit control over caching, materialization, and realtime mirroring
- point-in-time replay and version-bound querying

## A minimal FlashQL instance

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

const result = await db.query('SELECT 2::text AS value');
console.log(result.rows);
// [{ value: '2' }]

await db.disconnect();
```

This is the smallest useful FlashQL shape:

- create the client
- connect it
- run SQL
- disconnect it

## Persistence

FlashQL is ephemeral by default, but it becomes a serious local runtime when you attach a `keyval` backend.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { IndexedDBKV } from '@webqit/keyval/indexeddb';

const db = new FlashQL({
  keyval: new IndexedDBKV({ path: ['my-app'] }),
});

await db.connect();
```

What `keyval` changes:

- schema and data can survive reloads
- WAL history can be persisted
- sync state can be persisted
- FlashQL becomes appropriate for browser PWAs and local-first apps

Typical backends include:

- in-memory KV for tests and ephemeral sessions
- IndexedDB-backed KV in the browser
- custom KV adapters for other environments

## Dialects

FlashQL parses and executes both PostgreSQL-flavored and MySQL-flavored SQL.

### Set the dialect at client level

```js
const db = new FlashQL({ dialect: 'postgres' });
```

### Override it per query

```js
await db.query('SELECT `name` FROM `users`', { dialect: 'mysql' });
```

If you do not specify a dialect, FlashQL defaults to `postgres`.

## The core FlashQL surface

FlashQL supports the same top-level application contract as the other LinkedQL clients:

- `db.query()`
- `db.stream()`
- `db.transaction()`
- `db.wal.subscribe()`

And then adds local-engine-specific capabilities:

- `db.storageEngine`
- `db.sync`
- `versionStop`
- `overwriteForward`

## Live queries, streams, and WAL

FlashQL is not just a SQL parser over arrays. It is built to support modern app data flows directly.

### Live queries

```js
const result = await db.query(
  'SELECT id, name FROM public.users ORDER BY id',
  { live: true }
);

console.log(result.rows);

await result.abort();
```

Use live queries when the UI needs a query-shaped view that updates as local state changes.

See also: [Live Queries](/capabilities/live-queries)

### Streaming

```js
for await (const row of await db.stream('SELECT * FROM public.big_table ORDER BY id')) {
  console.log(row);
}
```

Use streams when you want lazy async iteration instead of fully buffered results.

See also: [Streaming](/capabilities/streaming)

### WAL subscriptions

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => console.log(commit)
);

await unsubscribe();
```

Use WAL subscriptions when you care about table-level commits directly.

See also: [Changefeeds](/capabilities/changefeeds)

## Transactions and MVCC

FlashQL is transaction-first. It exposes both a SQL-facing query surface and a lower-level storage transaction surface.

### Query-level transaction

```js
await db.transaction(async (tx) => {
  const table = tx.getTable({ namespace: 'public', name: 'users' });
  await table.insert({ id: 1, name: 'Ada' });
});
```

Internally, FlashQL's storage engine uses MVCC-oriented versioning and WAL replay to support:

- isolated transactional work
- live-query invalidation and diffing
- version-aware replay to earlier points in history

## Foreign data and local-first orchestration

This is where FlashQL goes beyond a plain embedded database.

FlashQL can attach foreign clients, register foreign namespaces, and expose upstream data locally through views that behave in one of three ways:

- `origin`: federated at read time
- `materialized`: copied locally on sync
- `realtime`: copied locally and kept hot after sync

That model is documented in detail here:

- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
- [FlashQL Sync](/flashql/sync)

## Point-in-time boot

FlashQL can open its local store at an earlier relation version.

### Read-only historical boot

```js
const historical = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
});

await historical.connect();
```

With `versionStop`, FlashQL replays persisted history until the last matching relation version and boots there.

By default, that boot is read-only.

### Overwrite-forward boot

```js
const branch = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
  overwriteForward: true,
});

await branch.connect();
```

With `overwriteForward: true`, FlashQL keeps the full history until the first mutating commit, then truncates forward history and lets you continue from that historical point.

This is documented in more detail in:

- [Version Binding](/capabilities/version-binding)
- [FlashQL Language Reference](/flashql/lang)

## What FlashQL does not try to be

FlashQL is ambitious, but it is still useful to say what it is not trying to do.

- It is not a byte-for-byte clone of PostgreSQL or MySQL.
- It does not claim universal support for every DDL and operational feature from mainstream servers.
- Some schema-evolution surfaces are still catching up.

The goal is application-level SQL power, not a full replacement for every server-side database responsibility.

## Where to go next

- [Language Reference](/flashql/lang)
- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
- [FlashQL Sync](/flashql/sync)
- [Query Interface](/docs/query-api)
