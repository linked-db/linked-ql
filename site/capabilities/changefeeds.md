# Changefeeds (WAL)

_Subscribe directly to table-level changefeeds_.

```js
await db.wal.subscribe(...)
```

## The minimal form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

This subscribes to all matching commits the database produces.

## Filtering by selector

Most real use cases want to narrow the scope to specific table names.

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

The id gives the subscription a stable slot identity.

When the subscription is re-issued with the same id, LinkedQL binds it to that same slot and:

- looks up the last commit successfuly consumed by the subscriber
- catches the subscriber up on missed-but-cached commits
- continue emitting to the subscriber from there

With stable slot IDs, a subscription stops being a disposable one-off subscription and becomes a resumable data channel with continuity across disconnects.

When you want to remove that persisted slot state, pass `{ forget: true }` to the `unsubscribe()` call:

```js
await unsubscribe({ forget: true });
```

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

## Related docs

- [Live Queries](/capabilities/live-queries)
