# FlashQL

*A full SQL runtime for the local process, the browser, the edge, and the offline world.*

```js
const db = new FlashQL();
await db.query(`SELECT $1::TEXT`, [20]);
```

FlashQL is LinkedQL's embeddable database engine: a complete in-process SQL runtime that runs anywhere JavaScript does, including Node.js, the browser, workers, and edge runtimes.

FlashQL brings together:

**Core engine**
- a full relational SQL engine
- transactional local storage with MVCC

**Reactive and realtime**
- live queries
- observable commit stream (WAL)

**Distributed data**
- federation, materialization, and sync

**Time and history**
- point-in-time boot via version-aware replay

---

## Why FlashQL

Modern applications increasingly need database power in places where a traditional database server is inconvenient, expensive, unavailable, or simply the wrong abstraction.

FlashQL directly maps to those use cases. Where the database is traditionally a remote dependency, FlashQL brings it into the application runtime.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

const result = await db.query('SELECT 2::text AS value');
console.log(result.rows);
// [{ value: '2' }]

await db.disconnect();
```

---

## Persistence

FlashQL is ephemeral by default, but it becomes a persistent local runtime when you attach a `keyval` backend.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { IndexedDBKV } from '@webqit/keyval/indexeddb';

const db = new FlashQL({
  keyval: new IndexedDBKV({ path: ['my-app'] }),
});

await db.connect();
```

With a `keyval` backend:

- schema and data survive reloads
- WAL history is persisted
- sync state is persisted
- FlashQL becomes appropriate for browser PWAs and local-first applications

But a persistence backend is not always necessary when used for tests, ephemeral sessions, and in-process computation.

---

## Dialects

FlashQL supports both PostgreSQL-flavored and MySQL-flavored SQL.

Set a default dialect at the client level:

```js
const db = new FlashQL({ dialect: 'postgres' });
```

Optionally override it per query:

```js
await db.query('SELECT `name` FROM `users`', { dialect: 'mysql' });
```

Where not specified, FlashQL defaults to `postgres`.

---

## The Common Query Surface

FlashQL supports the same top-level application contract as the other LinkedQL clients:

- `db.query()`
- `db.query({ live: true })`
- `db.stream()`
- `db.transaction()`
- `db.wal.subscribe()`

And then extends that with:

- `db.sync.sync()`

---

## Live Queries, Streams, and the Commit Stream (WAL)

FlashQL supports modern application data flows directly.

### Live Queries

```js
const result = await db.query(
  'SELECT id, name FROM public.users ORDER BY id',
  { live: true }
);

console.log(result.rows);
// current rows; the array keeps tracking the query as local state changes

await result.abort();
```

Use live queries when the application wants the query result itself to remain current over time.

Take a deep dive in:

* [Live Queries](/realtime/live-queries)

### Streaming

```js
for await (const row of await db.stream('SELECT * FROM public.big_table ORDER BY id')) {
  console.log(row);
}
```

This lets you consume large results lazily instead of buffering the full result in memory first.

See more in [db.stream()](/api/stream)

### The Commit Stream (WAL)

```js
const sub = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => console.log(commit)
);

await sub.abort();
```

This lets you subscribe to table-level commits directly.

See: [Changefeeds](/realtime/changefeeds)

---

## Transactions and the Multi-Version Concurrency Control (MVCC) Architecture

FlashQL uses **Multi-Version Concurrency Control (MVCC)**, the same core model used by PostgreSQL.

Every write creates a new version of a row, and every transaction reads from a **consistent snapshot in time**.

While you don't think about it, each query you run

```js
await db.query(
  `INSERT INTO public.users (id, name)
  VALUES (1, 'Ada');
  DELETE FROM public.orders WHERE id = 2;`
);
```

executes within a transaction. Errors are isolated to that transaction, and the entire operation is automatically rolled back on error.

Internally:

* transactions don’t overwrite rows—they produce new versions
* each transaction sees a stable view of the database
* reads and writes don’t block each other

If you’ve used PostgreSQL, this is the same idea—just running locally, in-process.

Because everything is versioned, FlashQL can layer on:

* **a row-version-aware sync engine**
* **WAL-based change streams**
* **replay and point-in-time boot**

—all without introducing a separate model for reactivity or sync.

---

## Federation, Materialization, and Sync

FlashQL can compute both local and remote data in **the same query**.

You simply define remote data locally; you decide how it behaves.

Your code sees normal tables:

```sql
SELECT *
FROM public.local_users u
JOIN public.remote_orders o ON o.user_id = u.id;
```

FlashQL computes the local + remote data as one relational graph.

Take a deep dive in:

- [Federation, Materialization, and Sync](/flashql/federation-and-sync)
- [The Sync API](/flashql/sync-api)

---

## Point-in-Time Boot

FlashQL can boot itself to a point in history – the state of the database at a certain table name and version.

### Read-Only Historical Boot

```js
const historical = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
});

await historical.connect();
```

With `versionStop`, FlashQL replays itself to the time when the database had the specified table at the specified version.

The effect is that the runtime boots against that historical boundary instead of replaying all the way forward to the latest state.

By default, that boot is read-only. Rewriting the hostory from that point forward is possible with an explicit opt-in:

#### `overwriteForward: true`

```js
const branch = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
  overwriteForward: true,
});

await branch.connect();
```

With `overwriteForward: true`, FlashQL keeps the history intact until the first mutating commit is made, then truncates forward histories and lets you continue from that historical point.

That turns the historical boot into a branch point: read-only until the first write, then writable from that point forward.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the FlashQL sync story in detail | [Federation, Materialization, and Sync](/flashql/federation-and-sync) |
| FlashQL language surface | [FlashQL Language Surface](/flashql/lang) |
