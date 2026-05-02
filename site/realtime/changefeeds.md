# Changefeeds (WAL)

_Subscribe directly to table-level changes_.

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
+ MySQL/MariaDB's Binary Log (Binlog)

---

## General Shape

Subscribe to all changes made across all tables in the database:

```js
const sub = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

Or narrow the scope to specific table names – via a namespace-to-table "selector" object:

```js
const sub = await db.wal.subscribe(
  { public: ['users', 'orders'] },
  (commit) => {
    console.log(commit.entries);
  }
);
```

Selectors can have the shapes:

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

See the [Core Guides](/guides#enabling-realtime) section for setup details by runtime.

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

const sub = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => commits.push(commit)
);

await db.query(`
  INSERT INTO public.users (id, name) VALUES (1, 'Ada');
  UPDATE public.users SET name = 'Ada Lovelace' WHERE id = 1;
`);
await db.query(`DELETE FROM public.users WHERE id = 1`);

await sub.abort();
```

What you get:

- two commit events, not three
- the first containing two entries: `insert` and `update`
- the second containing one: `delete`

---

## Subscribing to Views

`db.wal.subscribe()` is not limited to base tables. The same API can be used to subscribe to views, without changing how subscriptions are expressed.

`db.wal.subscribe()` simply operates over relations — the general name for tables and views. Once a subscription is attached to a relation, the system adapts to how that relation emits changes.

When you do:

```js
const sub = await db.wal.subscribe(
  { public: ['posts_view'] },
  (commit) => console.log(commit)
);
```

LinkedQL internally anchors the subscription on the view's change stream. That change stream may mean different things depending on the view's setup. But on the surface, `db.wal.subscribe()` remains consistent in shape and behaviour.

### View Change Streams

A view is a *predefined query*. Change events are always expressed in terms of that surface and its logical mutations, not in terms of raw table mutations.

Below is how that surface and its logical mutations work – by view type and configuration.

### Regular Views

A regular view has no runtime state. It is a query definition over base tables.

```js
await db.query(`
  CREATE VIEW public.posts_view AS
  SELECT id, title FROM public.posts
`);
```

On subscribing:

```js
await db.wal.subscribe(
  { public: ['posts_view'] },
  (commit) => console.log(commit)
);
```

the subscription is not attached to the view as with regular tables. It is anchored on the view's query itself – in realtime.

Changes observed over that query is the view's change stream.

### Materialized Views

A materialized view maintains a local state – like a table.

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.posts_mat AS
  SELECT id, title FROM public.posts
`);
```

On subscribing:

```js
await db.wal.subscribe(
  { public: ['posts_mat'] },
  (commit) => console.log(commit)
);
```

the subscription is anchored on the view itself — as with regular tables.

Changes observed over the view is the view's change stream. That typically happens when it is refreshed:

```js
await db.query(`REFRESH MATERIALIZED VIEW public.posts_mat`);
```

### Realtime Views

A realtime view maintains a continuously updated local state derived from its origin.

```js
await db.query(`
  CREATE REALTIME VIEW public.posts_rt AS
  SELECT id, title FROM public.posts
`);
```

On subscribing:

```js
await db.wal.subscribe(
  { public: ['posts_rt'] },
  (commit) => console.log(commit)
);
```

the subscription is anchored on the view itself — as with regular tables.

Changes observed over the view is the view's change stream. Being a real-time view, changes are observed in realtime as the underlying tables change.

### Remote-Backed Views (cross-boundary resolution)

Views with remote origins behave the same as above. The difference is in internal resolution.

When you do:

```js
await db.query(`
  CREATE VIEW public.posts_remote AS
  SELECT id, title FROM public.posts
  WITH (replication_origin = 'postgres:db1')
`);
```

Subscriptions are still expressed against the local view surface:

```js
await db.wal.subscribe(
  { public: ['posts_remote'] },
  (commit) => console.log(commit)
);
```

But the change stream now crosses a boundary.

The model remains uniform regardless: the consumer always subscribes locally, the resolution is handled internally.

---

## Stable Subscription Slots

Subscriptions can be given a stable id:

```js
const sub = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => console.log(commit),
  { id: 'users_slot' }
);
```

A subscription ID gives the subscription a durable slot identity, and LinkedQL binds that subscription to the same slot each time it is recreated with the same id.

### Behaviour

With a durable slot identity, the runtime is able to resume from the same logical slot on re-subscription:

- delivers commits that were missed while subscriber was away
- continues into the current commit stream

That matters when changefeeds back application caches, replicas, sync workers, or long-lived UI sessions that must continue from a known point rather than restarting blindly from "now."

### Example

The subscription below has a stable slot ID.

`commits` is the array of changes observed over the subscription.

```js
const commits = [];

const sub = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => commits.push(commit),
  { id: 'users_slot' }
);
```

On executing the following, we get one commit event that describes two operation – `INSERT`, `UPDATE`:

```js
await db.query(`
  BEGIN;
  INSERT INTO public.users (id, name) VALUES (1, 'Ada');
  UPDATE public.users SET name = 'Ada Lovelace' WHERE id = 1;
  COMMIT;
`);
```

After we abort, subsequent operations made while away are cached on the slot:

```js
await sub.abort();

await db.query(`DELETE FROM public.users WHERE id = 1`);
```

On re-issuing the subscription with the same slot ID, event delivery is resumed from last known state:

```js
const sub = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => commits.push(commit),
  { id: 'users_slot' }
);
```

- the missed `delete` operation is delivered
- the slot is drained as the subscriber catches up over time

---

## Dropping Slots

To drop the slot itself, pass `{ forget: true }` to the `sub.abort()` call:

```js
await sub.abort({ forget: true });
```

---

## Visibility and Security

`db.wal.subscribe()` exposes a powerful information stream to the host application. It lets you subscribe directly to the commit stream of the database — the Write Ahead Log (WAL) of a PostgreSQL or FlashQL database, for example. That also means it needs a security boundary that controls which database changes are actually emitted.

That boundary is defined through the `resolveCommitVisibility(entries, sub)` hook.

```js
const db = new PGClient({
  resolveCommitVisibility: async (entries, sub) => {
    return entries;
  },
});
```

It lets you intercept a subscriber’s event payload and filter for visibility.

The resolution pipeline is:

1. a database commit matches a subscription and is selected for dispatch
2. LinkedQL passes the commit’s `entries` through `resolveCommitVisibility(entries, sub)`
3. the hook returns the visible subset of the input array (or `null` to defer to default behavior)
4. LinkedQL emits the filtered commit

That hook answers the policy question:

> “Which of the rows described in this commit are visible to this subscriber?”

That precision matters because one commit can describe multiple rows, and they may not all share the same visibility rule.

Below is an example that applies application-level filtering to dispatch payloads by suppressing certain commit shapes entirely:

```js
const db = new PGClient({
  resolveCommitVisibility: async (entries, sub) => {
    // Filter by relation name
    return entries.filter((entry) => entry.relation.name !== 'audit_log');
  },
});
```

In this case commits involving `audit_log` aren’t exposed to `db.wal.subscribe()`

### When `db.wal.subscribe()` Becomes User-Facing

`db.wal.subscribe()` is primarily an application-facing primitive. It exists to drive internal systems — cache invalidation, projections, background workflows — where the consumer is trusted and visibility is either implicit or centrally enforced.

That’s different from `db.query()`, which naturally sits at the boundary between application and user. A query already carries a visibility model with it; the WAL does not.

The WAL is just a log of what changed. It has no concept of roles, policies, or access control. If you pass it through to end users — directly or indirectly — you are responsible for introducing that layer.

Whether that layer lives entirely inside `resolveCommitVisibility()`, or is composed with other mechanisms, depends on the shape of your system. **But once a changefeed becomes user-facing, filtering stops being optional. It becomes a hard requirement.**

Now, the problem is no longer just about protecting the application from seeing too much — it becomes about ensuring that *each subscriber* only sees what they’re entitled to see. The question being answered isn’t just “should this change be emitted?”. It now includes “for whom is this change visible?”.

That moves visibility from a single, centralized filter into something that must be evaluated per subscriber, per event. This is context the sections below build on.

### When the Visibility Rules Live In the Database Itself

In many applications, access control and visibility policies are not enforced in application code. They are pushed into the database layer itself — for example, via PostgreSQL’s **Row-Level Security (RLS)**. The database decides which rows exist for a given query.

The general idea is: enable RLS on a table, define policies, and let the database enforce them:

```js
await db.query(`
  ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "users can see their own posts"
  ON public.posts
  USING (author_id = current_setting('claims.user_id')::text);
`);
```

This is designed for normal queries. They execute within a context — session variables, roles, etc. The database evaluates the policy against that context and filters rows accordingly.

The WAL has no such context.

A commit entry is just a structural description of a change: relation, operation, row data. It is not evaluated against RLS, and it does not carry the session state that produced it.

To have RLS as the source of truth for visibility over changefeed events, **you must reconstruct it explicitly inside `resolveCommitVisibility()`**.

A simple version looks like this:

```js
const db = new PGClient({
  resolveCommitVisibility: async (entries, sub) => {
    const visible = [];

    for (const entry of entries) {
      const id = entry.old?.id || entry.key?.id || entry.new?.id;

      const result = await db.query(
        `SELECT 1
        FROM public.posts
        WHERE id = $1`,
        [id]
      );

      if (result.rows.length) {
        visible.push(entry);
      }
    }

    return visible;
  },
});
```

The idea above is to re-query the database and let RLS decide whether the row in question “exists” under the given execution context – the general connection used for the lookup.

The problem with this version is that:

* the lookup runs outside the original execution context of the user unless you recreate it manually
* the execution context – the connection used for the lookup – is the same for all subscribers, whereas the RLS policy in this example only works per-subscriber

The above suffices only when visibility rules are global (e.g. “hide this table”, “hide soft-deleted rows”), but starts to break down when visibility depends on *who* the subscriber is.

That’s where transactions come in.

### Transaction-Scoped WAL Subscriptions

Transactions give you a way to bind a subscription to a specific execution context — the same mechanism used by RLS-backed queries.

When you issue a subscription inside a transaction, that transaction becomes part of the subscription’s identity.

```js
const tx = await db.begin();

await db.query(
  `SELECT set_config('claims.user_id', 'user_abc_123', true)`,
  { tx }
);

const sub = await db.wal.subscribe(
  { public: ['posts'] },
  (commit) => console.log(commit),
  { tx }
);
```

Here, the subscription is created under a transaction that already carries a policy context (`claims.user_id`).

LinkedQL makes that transaction available to `resolveCommitVisibility()` via `sub.tx`:

```js
resolveCommitVisibility(entries, sub) {
  console.log(sub.tx); // The originating transaction
}
```

That changes how visibility can be computed.

Instead of applying a single, shared context, the hook can evaluate each entry inside the exact same context the subscription was created with:

```js
const db = new PGClient({
  resolveCommitVisibility: async (entries, sub) => {
    const visible = [];

    for (const entry of entries) {
      const id = entry.old?.id || entry.key?.id || entry.new?.id;

      const result = await db.query(
        `SELECT 1
        FROM public.posts
        WHERE id = $1`,
        { values: [id], tx: sub.tx }
      );

      if (result.rows.length) {
        visible.push(entry);
      }
    }

    return visible;
  },
});
```

Now the lookup is no longer global — it is scoped per subscriber.

Each subscription evaluates visibility through its own transaction, with its own session variables, roles, and policies. The database becomes the authority again, just as it is for queries.

At that point, the changefeed stops being:

> “what changed in the database”

and becomes:

> “what changed, as seen through this subscriber’s policy context”

That shift is the same one Live Queries make — just implemented one layer lower, at the level of commits instead of query results.

### A Practical Pattern

Suppose a commit contains multiple `post` changes, but the policy restricts users to specific rows, that subset of the commit is what a subscriber should see. This could look like the below:

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
      const id = entry.old?.id || entry.key?.id || entry.new?.id;

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

  Here, `sub.liveQueryOriginated` is a boolean flag that tells if the subscription originated from the Live Query engine, as may be the case when the `resolveCommitVisibility()` handler is paired with `centralizeCommitVisibility: true`. (See Live Queries' [Visibility and Security](/realtime/live-queries#visibility-and-security) section for details.)

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
| the subscription API in detail | [`db.wal.subscribe()`](/api/wal-subscribe) |
