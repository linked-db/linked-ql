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

## Enabling Realtime Capabilities

LinkedQL’s realtime capabilities (live queries and WAL subscriptions) depend on the support mode of the underlying database. For FlashQL and the Edge runtime client, this is automatic. But for the mainstream database family, this works behind a configuration.

See the [Enabling Realtime Capabilities](/docs/setup#enabling-realtime-capabilities) documentation for details.

## What Commit Objects Look Like

A commit contains one or more entries describing row-level changes.

```js
{
  txId: 234214,
  entries: [...],
}
```

+ `txId` is the ID of the transaction
+ `entries` is an array of one or more change descriptors

### `insert` Descriptor

```js
{
  op: 'insert',
  relation: { namespace: 'public', name: 'users', keyColumns: ['id'] },
  new: { id: 1, name: 'Ada' }
}
```

### `update` Descriptor

```js
{
  op: 'update',
  relation: { namespace: 'public', name: 'users', keyColumns: ['id'] },
  old: { id: 1, name: 'Ada' },
  new: { id: 1, name: 'Ada Lovelace' }
}
```

### `delete` Descriptor

```js
{
  op: 'delete',
  relation: { namespace: 'public', name: 'users', keyColumns: ['id'] },
  old: { id: 1, name: 'Ada Lovelace' }
}
```

### Variations

While the above is the standard shape, the following attributes may vary depending on the underlying database system or configuration:

#### FlashQL

- `descriptor.old`: always present

#### PostgreSQL

- `descriptor.old`: present when the database's `REPLICA IDENTITY` is `FULL`, otherwise, you get:
- `descriptor.key`: present when the database's `REPLICA IDENTITY` is `DEFAULT`

#### MySQL/MariaDB

*Coming soon*

### Example

```js
const commits = [];

const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => commits.push(commit)
);

await db.query(`
  INSERT INTO public.users (id, name) VALUES (1, 'Ada');
  UPDATE public.users SET name = 'Ada Lovelace' WHERE id = 1;
`);
await db.query(`DELETE FROM public.users WHERE id = 1`);

await unsubscribe();
```

What you get:

- two commit events, not three
- the first containing two entries: `insert` and `update`
- the second containing one: `delete`

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
- continues emitting to the subscriber from that state
- avoids treating every reconnect as a brand-new subscription

That matters when changefeeds back application caches, replicas, sync workers, or long-lived UI sessions that must continue from a known point rather than restarting blindly from "now."

### Example

```js
const commits = [];

const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => commits.push(commit),
  { id: 'users_slot' }
);

await db.query(`
  INSERT INTO public.users (id, name) VALUES (1, 'Ada');
  UPDATE public.users SET name = 'Ada Lovelace' WHERE id = 1;
`);

await unsubscribe();

await db.query(`DELETE FROM public.users WHERE id = 1`);
```

What happens:

- you get one commit event containing two entries: `insert` and `update`
- you called `unsubscribe()` and don't get the second commit

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => commits.push(commit),
  { id: 'users_slot' }
);
```

What happens now:

- you re-subscribed to the same subscription slot
- you get the one commit event you missed: `delete`

## Dropping Slots

To drop the slot itself, pass `{ forget: true }` to the `unsubscribe()` call:

```js
await unsubscribe({ forget: true });
```

## Related Docs

- [Live Queries](/capabilities/live-queries)
