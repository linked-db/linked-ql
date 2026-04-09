# Changefeeds (WAL)

_Subscribe directly to table-level changefeeds_.

```js
await db.wal.subscribe(...)
```

## The Minimal Form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

This subscribes to all matching commits the database produces.

## Filtering by Selector

Most real use cases want to narrow the scope to specific table names.

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users', 'orders'] },
  (commit) => {
    console.log(commit.entries);
  }
);
```

### Common Selector Forms

```js
'*'
{ public: ['users'] }
{ public: ['users', 'orders'] }
[{ namespace: 'public', name: 'users' }]
```

The selector is normalized internally into a namespace-to-table mapping.

## What Commit Objects Look Like

A commit contains one or more entries describing row-level changes.

```js
{
  txId: 234214,
  entries: [...]
}
```

+ `txId` is the ID of the transaction
+ `entries` is an array of one or more change descriptors

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

## Example: Subscribe to All Commits on One Table

```js
const events = [];

const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => events.push(commit)
);

await db.query(`
  INSERT INTO public.users (id, name) VALUES (1, 'Ada');
  UPDATE public.users SET name = 'Ada Lovelace' WHERE id = 1
`);
await db.query(`DELETE FROM public.users WHERE id = 1`);

await unsubscribe();
```

What you get:

- two commit events, not three
- the first containing two entries: insert and update
- the second containing one: delete

## Stable Subscription Slots

Subscriptions can be given a stable id:

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => console.log(commit),
  { id: 'users_slot' }
);
```

That id is more than a label. It gives the subscription a durable slot identity, and LinkedQL binds that subscription to the same slot each time it is recreated with the same id.

With that slot identity, the runtime:

- resumes from the same logical slot
- catches up on commits that were missed while the subscriber was away
- continue emitting to the subscriber from there
- avoids treating every reconnect as a brand-new subscription

That matters when changefeeds back application caches, replicas, sync workers, or long-lived UI sessions that must continue from a known point rather than restarting blindly from "now."

To drop the slot itself, pass `{ forget: true }` to the `unsubscribe()` call:

```js
await unsubscribe({ forget: true });
```

## Runtime Notes

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

## Related Docs

- [Live Queries](/capabilities/live-queries)
