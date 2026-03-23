# Changefeeds (WAL)

LinkedQL exposes table-level changefeeds through:

```js
await db.wal.subscribe(...)
```

This API lets you observe structured commits instead of observing a query result.

That distinction matters:

- live queries answer "what does this query look like now?"
- changefeeds answer "what table mutations just happened?"

## The minimal form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

This subscribes to all matching commits the runtime can produce.

## Filtering by selector

Most real use cases want to narrow the scope.

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users', 'orders'] },
  (commit) => {
    console.log(commit.entries);
  }
);
```

### Common selector forms

```js
'*'
{ public: ['users'] }
{ public: ['users', 'orders'] }
[{ namespace: 'public', name: 'users' }]
```

The selector is normalized internally into a namespace-to-table mapping.

## What commit objects look like

A commit contains one or more entries describing row-level changes.

Typical entries look like this:

```js
{
  op: 'insert',
  relation: { namespace: 'public', name: 'users' },
  new: { id: 1, name: 'Ada' }
}
```

Or:

```js
{
  op: 'update',
  relation: { namespace: 'public', name: 'users' },
  old: { id: 1, name: 'Ada' },
  new: { id: 1, name: 'Ada Lovelace' }
}
```

Or:

```js
{
  op: 'delete',
  relation: { namespace: 'public', name: 'users' },
  old: { id: 1, name: 'Ada Lovelace' }
}
```

The exact payload depends on the mutation and runtime, but this is the mental model:

- `op` tells you what happened
- `relation` tells you where it happened
- `old` / `new` describe the row transition

## Example: subscribe to all commits on one table

```js
const events = [];

const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => events.push(commit)
);

await db.query(`INSERT INTO public.users (id, name) VALUES (1, 'Ada')`);
await db.query(`UPDATE public.users SET name = 'Ada Lovelace' WHERE id = 1`);
await db.query(`DELETE FROM public.users WHERE id = 1`);

await unsubscribe();
```

What this gives you:

- insert commit entries
- update commit entries
- delete commit entries

## Stable subscription ids and forgetting state

Subscriptions can be given a stable id:

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => console.log(commit),
  { id: 'users_slot' }
);
```

This matters for runtimes that persist subscription slots and catch-up state.

When you want to remove that persisted slot state too:

```js
await unsubscribe({ forget: true });
```

## WAL subscriptions vs live queries

These two capabilities often appear together, but they serve different jobs.

### Use a live query when

- your application wants the *current result* of a query
- you want LinkedQL to maintain that result for you
- the UI is driven by a query-shaped view

### Use `wal.subscribe()` when

- you care about table-level events
- you want to build your own projection or side effects
- you want direct visibility into inserts, updates, and deletes

## Runtime notes

### FlashQL

FlashQL has a built-in WAL/changefeed engine. No external replication server is required.

That makes it especially convenient for:

- local-first apps
- local event processors
- testing change-driven flows

### PostgreSQL

With `PGClient`, WAL-backed capabilities rely on PostgreSQL logical replication setup.

### EdgeClient

`EdgeClient` forwards WAL subscriptions over transport from an upstream LinkedQL-capable runtime such as:

- `PGClient` behind an `EdgeWorker`
- `FlashQL` behind an `EdgeWorker`

## Changefeeds and sync

FlashQL's realtime sync views are built on the same general changefeed idea.

That is worth understanding because it connects two seemingly separate features:

- a table-level subscription is useful directly to applications
- that same mechanism also powers local realtime mirroring in FlashQL sync workflows

See: [FlashQL Sync](/flashql/sync)

## Related docs

- [Query Interface](/docs/query-api)
- [Live Queries](/capabilities/live-queries)
- [The Realtime Engine](/engineering/realtime-engine)
