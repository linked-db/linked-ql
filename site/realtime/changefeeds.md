# Changefeeds (WAL)

_Subscribe directly to table-level commit streams_.

```js
await db.wal.subscribe(...)
```

Table-level changefeeds are especially useful for:

- triggering workflow runs
- driving cache invalidation
- feeding audit, fan-out, or projection pipelines

`db.wal.subscribe(...)` is driven directly from the underlying database's commit stream:

+ FlashQL's Write Ahead Log (WAL)
+ PostgreSQL's Write Ahead Log (WAL)
+ MySQL/MariaDB's Binary Logging (Binlog)

---

## The Minimal Form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

This subscribes to all matching commits the database produces.

---

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

---

## Enabling Realtime Capabilities

LinkedQL’s realtime capabilities (live queries and WAL subscriptions) depend on the support mode of the underlying database. For FlashQL and the Edge runtime client, this is automatic. But for the mainstream database family, this works behind a configuration.

See the [Guides](/guides/#enabling-realtime) section for setup details by runtime.

---

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

---

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
  BEGIN;
  INSERT INTO public.users (id, name) VALUES (1, 'Ada');
  UPDATE public.users SET name = 'Ada Lovelace' WHERE id = 1;
  COMMIT;
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

---

## Dropping Slots

To drop the slot itself, pass `{ forget: true }` to the `unsubscribe()` call:

```js
await unsubscribe({ forget: true });
```

---

## Visibility and Security

`db.wal.subscribe()` exposes a powerful information stream to the host application and its users. It lets you subscribe directly to the commit stream of the database – the Write Ahead Log (WAL) of a PostgreSQL or FlashQL database, for example. That also means it needs a security boundary that ideally controls what's visible and to whom.

That boundary is defined through the `resolveCommitVisibility(entries, sub)` hook.

```js
const db = new PGClient({
  resolveCommitVisibility: async (entries, sub) => {
    return entries;
  },
});
```

It lets you intercept a subscriber's event payload and filter for visibility.

The resolution pipeline is:

1. a database commit matches a subscription and is selected for dispatch
2. LinkedQL passes the commit's `entries` through `resolveCommitVisibility(entries, sub)`
3. the hook returns the visible subset of the input array (or `null` to defer to default behavior)
4. LinkedQL emits the filtered commit

That hook answers the policy question:

> "Which of the rows described in this commit are visible to this subscriber?"

That precision matters because one commit can describe multiple rows and they may not all share the same visibility rule.

### Transaction-Scoped WAL Subscriptions

Transactions are a common way to enforce visibility rules in most database systems, like PostgreSQL. You are able to attach policies that apply in the lifetime of a specific transaction. LinkedQL natively supports this pattern.

When you run `db.wal.subscribe()` within a policy-bound transaction, your `resolveCommitVisibility()` handler executes within that transaction’s context.

In PostgreSQL, this pairs naturally with **Row-Level Security (RLS)**.

That could look like:

```js
const tx = await db.begin();

await db.query(
  `SELECT set_config('claims.user_id', 'user_abc_123', true)`,
  { tx }
);

const unsubscribe = await db.wal.subscribe(
  { public: ['posts'] },
  (commit) => console.log(commit),
  { tx }
);
```

Here, the subscription is issued with `{ tx }` – i.e. issued within a transaction context. LinkedQL passes that same transaction to `resolveCommitVisibility()` as `sub.tx`.

```js
resolveCommitVisibility(entries, sub) {
  console.log(sub.tx); // The original transaction
}
```

The hook is able to look up each row in `entries` within that transaction – the exact same security context in which the subscription was created – to determine visibility.

So in a policy-driven system, the emitted changefeed stops being merely "what changed in the database" and becomes "what this subscriber is allowed to observe changing."

### A Practical Pattern

Suppose a commit contains multiple `post` changes, but the policy restricts users to specific rows, that subset of the commit is what subscribers should see. This is shown below:

```sql
BEGIN;
INSERT INTO posts (id, title) VALUES (1, 'Visible');
INSERT INTO posts (id, title) VALUES (2, 'Hidden');
COMMIT;
```

```js
const db = new PGClient({
  resolveCommitVisibility: async (entries, sub) => {
    const visibleEntries = [];

    // Each entry is resolved by querying the database within the subscriber’s transaction context
    for (const entry of entries) {
      const id = entry.old?.id ?? entry.new?.id;

      const result = await db.query(
        `SELECT id
        FROM public.posts
        WHERE id = $1`,
        { values: [id], tx: sub.tx }
      );

      if (entry.op === 'delete') {
        if (!result.rows.length) {
          visibleEntries.push(entry);
        }
        continue;
      }

      if (result.rows.length) {
        visibleEntries.push(entry);
      }
    }

    return visibleEntries;
  },
});
```

For each entry:

* `insert` and `update` are visible only if the lookup confirms that they actually exist for the given subscriber
* `delete` is visible only if the lookup confirms that the row actually disappeared for the given subscriber

### Outside a Transaction

When subscriptions are not transaction-scoped, a `resolveCommitVisibility()` hook may still be useful.

Although its `sub.tx` would be `null`, you can still:

* apply application-level filtering to dispatch payloads
* suppress certain commit shapes entirely

```js
const db = new PGClient({
  resolveCommitVisibility: async (entries, sub) => {

    console.log(sub.tx);
    console.log(sub.liveQueryOriginated);

    if (sub.liveQueryOriginated) {
      // This is a subscription made by the live query engine
      // returning null lets the Live Query engine apply its default visibility behavior
      return null;
    }

    // Filter by relation name
    return entries.filter((entry) => entry.relation.name !== 'audit_log');
  },
});
```

In this case:

* commits involving `audit_log` aren't exposed to `db.wal.subscribe()`
* subscriptions originating from the Live Query engine are left to the Live Query engine's default visibility behavior

### What the Hook Receives

The function signature is:

```js
resolveCommitVisibility(entries, sub)
```

Where:

* `entries` is a list of descriptors for the rows touched by the commit that intersect with the subscription
* `sub` is a small subscription descriptor containing context

  ```js
  {
    tx,
    liveQueryOriginated,
  }
  ```

  Here, `sub.liveQueryOriginated` is a boolean flag that tells if the subscription originated from the Live Query engine, as may be the case when the `resolveCommitVisibility()` handler is paired with `centralizeCommitVisibility: true`. (See Live Queries' [Visibility and Security](/realtime/live-queries#visibility-and-security) section for that.)

On receiving the above, the hook must return one of:

* an array of entries: the visible subset of the input array for the given subscriber
* `null`: which means: "take the default action"

For subscriptions that aren't `liveQueryOriginated`, returning `null` is treated as an empty array. In other words, the entire commit is invisible to the subscriber.

For subscriptions that are `liveQueryOriginated`, returning `null` tells the engine to go ahead with its default visibility behavior. Returning `null` is the default behavior unless explicit filtering is required.

### Important Rule

If you issue transaction-bound subscriptions – `db.wal.subscribe(..., { tx })` – you must also provide `resolveCommitVisibility()`.

Without it, LinkedQL has no reliable way to answer the question:

> "What's visible in the context of this transaction?"

An error is thrown in that case.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the related live query model | [Live Queries](/realtime/live-queries) |
| the `db.wal.subscribe()` API in detail | [API: `db.wal.subscribe()`](/api/wal-subscribe) |
