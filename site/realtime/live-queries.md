# Live Queries

*Turn on reactivity over arbitrary SQL with `{ live: true }`.*

```js
const result = await db.query('SELECT * FROM posts', { live: true });
```

You get back a live result set that can directly drive application-level reactivity.

---

## General Idea

Live queries are a first-class concept in LinkedQL.

They happen over the same `db.query()` API:

```js
const result = await db.query('SELECT * FROM posts', { live: true });
```

In live mode, the query stays open and `result.rows` becomes a self-updating result set.

It remains a normal JavaScript array:

```js
console.table(result.rows);
console.log(result.rows.length); // 3
```

But it stays in sync with the underlying database truth:

```sql
INSERT INTO posts (title) VALUES ('Post A');
```

```js
console.table(result.rows);
console.log(result.rows.length); // 4
```

`result.rows` will grow, shrink, reorder, and mutate to reflect the latest truth of the query as changes happen underneath it. This holds not only for simple table scans, but also for joins, limits, aggregates, subqueries, and derived tables.

Live mode can be stopped explicitly:

```js
await result.abort();
```

Above, `result` is a [`RealtimeResult`](/api/query#realtimeresult).

::: tip Deep Dive
The mechanics of the engine are covered in the [LinkedQL Realtime Engineering Paper](/engineering/realtime-engine).
:::

---

## Enabling Realtime Capabilities

LinkedQL’s realtime capabilities (live queries and WAL subscriptions) depend on the support mode of the underlying database. For FlashQL and the Edge runtime client, this is automatic. But for the mainstream database family, this works behind a configuration.

See the [Guides](/guides#enabling-realtime) section for setup details by runtime.

---

## Live Queries in Practice

Live querie have various real-world use cases. Consider the following.

### Analytics Dashboards

A live metric board where aggregates and rollups update as source data changes.

The important behavior is not just "new rows arrive." It is that totals, subtotals, and grouped outputs rebalance in place as the underlying rows change.

```sql
SELECT
  region,
  product,
  SUM(sales) AS total_sales,
  ROLLUP(region, product)
FROM orders
GROUP BY GROUPING SETS ((region, product), (region), ());
```

Observed effect: totals and subtotals rebalance in place as orders stream in. Charts can update directly from the live view instead of being rebuilt from ad hoc event logic.

### Collaborative Workspaces

A shared document list showing current editors, owners, or status indicators.

```sql
SELECT
  d.id,
  d.title,
  u.name AS active_editor
FROM documents d
LEFT JOIN users u ON d.active_user = u.id;
```

When a user opens or leaves a document, the corresponding row in the result updates as a row.

Observed effect: the row persists while the joined field changes in place. The view stays continuous.

### Live Feeds

A user-facing feed ordered by recency and limited in size.

```sql
SELECT *
FROM posts
ORDER BY created_at DESC
LIMIT 20;
```

Here the live result keeps representing "the newest twenty posts", not anymore "the twenty posts that happened to be present at first render."

Observed effect: new posts slide into the top of the view; older ones fall off. Ordering and window limits continue to hold.

### Rankings and Leaderboards

Window functions and aggregates often define the visible shape of the result itself.

```sql
SELECT
  user_id,
  SUM(score) AS total_score,
  RANK() OVER (ORDER BY SUM(score) DESC) AS rank
FROM scores
GROUP BY user_id;
```

As scores change, ranks move as part of the query result.

Observed effect: scores accumulate in place and ranks shift as the underlying rows change.

### Mixed and Derived Sources

Queries that combine subqueries, derived tables, and inline relations behave the same way.

```sql
SELECT
  p.id,
  p.title,
  r.reaction_count,
  c.comment_count
FROM posts p
JOIN (
  SELECT post_id, COUNT(*) AS reaction_count
  FROM reactions
  GROUP BY post_id
) r ON r.post_id = p.id
LEFT JOIN (
  SELECT post_id, COUNT(*) AS comment_count
  FROM comments
  GROUP BY post_id
) c ON c.post_id = p.id;
```

Observed effect: changes to reactions or comments are reflected in the joined aggregate view itself, not leaked as unrelated table events for the application to reconcile manually.

---

## Live Views in Detail

`result.rows` is a self-updating array of objects, each row in the array reflecting the current query truth in realtime.

For a query like:

```js
const result = await db.query(
  'SELECT id, title FROM posts ORDER BY id',
  { live: true }
);
```

You get an initial result:

```js
[A, B, C, D] // initial result
```

When a matching row is inserted in the database, it appears in the view:

```sql
INSERT INTO posts (title) VALUES ('Hello World');
```

```js
[A, B, C, D, E] // E added
```

When a matching row is updated in the database, the corresponding row object in the view updates in place:

```sql
UPDATE posts SET title = 'Hello Again' WHERE title = 'Hello World';
```

```js
[A, B, C^, D, E] // C updated in place
```

When a matching row is deleted in the database, the corresponding row leaves the view:

```sql
DELETE FROM posts WHERE title = 'Hello Again';
```

```js
[A, B, D, E] // C deleted
```

That is the simplest live-view model: the query result automatically remains current.

---

## Joins and Join Transitions

Once a query involves joins:

```js
const result = await db.query(
  `SELECT
     posts.id,
     posts.title,
     users.name AS author_name
   FROM posts
   LEFT JOIN users ON posts.author_id = users.id`,
  { live: true }
);
```

the semantics get deeper.

Here, rows in the result are composed from multiple relations. As underlying tables change, the visible effect is not always a simple add, update, or remove.

A table-level mutation may affect only the right-hand or left-hand side of a join. That may mean that a right-hand or left-hand side of the join that once matched no longer matches, or the reverse. In LinkedQL, this is understood as Join Transitions.

By default, certain join transitions should cause the corresponding old row in the view to disappear and be regained as a new row. But that would break continuity and identity for observers bound to those rows. LinkedQL prevents that by special-casing these transitions to preserve identity and continuity.

The result is: stable rows that simply mutate in-place in however the underlying tables change.

### Scenario 1: A Join Materializes After an INSERT

Suppose a post already exists with an `author_id: 42`, but the matching user row does not yet exist. Suppose the following INSERT materializes the join:

```sql
INSERT INTO users (id, name) VALUES (42, 'Bob');
```

The observed effect in the view would be: **the existing row now gains a right-hand match**.

```js
┌──────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: null ─────→ 'Bob' } │
└──────────────────────────────────────────────────────────────┘
```

### Scenario 2: The Join Relationship Changes After an UPDATE

Suppose `author_id` is updated to point to another user. That would change the join relation.

```sql
UPDATE posts SET author_id = 43 WHERE title = 'Untitled';
```

The observed effect would be: **the row persists; the joined field changes; continuity is preserved**

```js
┌───────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: 'Bob' ─────→ 'Ada' } │
└───────────────────────────────────────────────────────────────┘
```

### Scenario 3: The Join Dissolves After a DELETE

Suppose the current right-hand match is deleted. That would dissolve the relationship.

```sql
DELETE FROM users WHERE id = 43;
```

The observed effect would be: **the corresponding row remains in the view but loses its right-hand match.**

```js
┌──────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: 'Ada' ─────→ null } │
└──────────────────────────────────────────────────────────────┘
```

The overall effect becomes: identity persists. The view stays true to join semantics without leaking low-level mutation shape into the result model.

---

## Frames and Ordinality

Queries that have ordering, limits, or offsets applied materialize in the view with the semantics of each modifier fully maintained.

```js
const top5 = (await client.query(
  `SELECT *
  FROM posts
  ORDER BY created_at DESC
  LIMIT 5`,
  { live: true }
)).rows;
```

This view will _always_ represent "the newest 5 posts" across `INSERT` and `DELETE` operations.

Initially:

```text
[A, B, C, D, E] // initial result
```

Then on "_`INSERT N`_":

```text
[N, A, B, C, D]   // N enters the view; E falls off because it’s now #6
```

Then on "_`UPDATE` `C`’s `created_at` to promote it one level higher in the list_":

```text
[N, A, C, B, D]   // C and B swap places without initiating a full re-ordering
```

Essentially, ordering and slicing remain stable relationships — they evolve as data changes, without recomputation.

---

## Precision and Granularity

Live updates apply the smallest possible change needed to keep the view correct. This is a key design goal in LinkedQL.

**(a) Field-level updates**

If only one column changes in one row, only that column is updated in the corresponding row in the view.

```js
const current3 = result.rows[2];
```

```sql
UPDATE posts SET title = 'Draft' WHERE id = 3;
```

```js
console.log(result.rows[2].title); // 'Draft'
console.log(current3 === result.rows[2]); // true; persistent, only patched
```

**(b) Reordering without teardown**

When the effect of an operation is simply a change in position (for queries with an `ORDER BY` clause), the view isn't re-ordered in full. Instead, the engine issues a positional `swap` event: "swap B and C"

```text
Before: [A, B, C, D, E]
After:  [A, C, B, D, E]
```

`C` and `B` simply swap places.

**Why that matters:**

Precision and granularity keeps the system – all the way to the consumers bound to the view – highly efficient. When rendering on the UI, for example:

* The UI maintains state, avoids unnecessary rerenders, and never flickers.
* Components keyed by row identity keep their state.
* You don’t lose scroll position.

---

## Observability and Atomicity

Live views are not just auto-updating — they are also **observable**.

LinkedQL exposes them through the [Observer API](https://github.com/webqit/observer). Observer is a general-purpose JavaScript API for observing object and array-level mutations.

This makes `result.rows` observable via `Observer.observe()`.

```js
Observer.observe(result.rows, (mutations) => {
    console.log(`${mutations[0].type}: ${mutations[0].key} = ${mutations[0].value}`);
});
```

You pass just a callback, as shown above, to observe root-level changes — which, for `result.rows`, means row additions and deletions.

You observe field-level changes by adding the `Observer.subtree()` directive:

```js
Observer.observe(result.rows, Observer.subtree(), (mutations) => {
    console.log(`${mutations[0].type}: ${mutations[0].key} = ${mutations[0].value}`);
});
```

LinkedQL leverages Observer’s batching feature to preserve the atomicity of the database transactions behind the emitted events. All mutations that occur within a single database transaction are delivered together in a single callback turn.

For example:

```sql
BEGIN;
UPDATE posts SET title = 'Pinned' WHERE id = 3;
UPDATE posts SET title = 'Pinned' WHERE id = 4;
COMMIT;
```

Observer fires once, with a batch containing both updates:

```js
Observer.observe(result.rows, Observer.subtree(), (mutations) => {
    console.log(mutations);
    /*
    Example output:
    [
        { type: 'set', path: [0, 'title'], value: 'Pinned' },
        { type: 'set', path: [1, 'title'], value: 'Pinned' }
    ]
    */
});
```

Transactions are not split across multiple emissions. Each callback reflects a complete and consistent state transition.

---

## Driving Application-Level Reactivity Directly

Live Views are designed to directly drive application-level reactivity.

The model is simple: as the result object flows through your application, application logic directly reacts to its changes – even as a regular JavaScript object.

```js
Observer.observe(result.rows, (mutations) => {
    console.log(mutations);
});
```

That removes an entire layer of work:

* no **event-to-state mapping** layer
* no **reducers** or **reconciliation logic**
* no risk of state drifting from the source of truth

The database result itself becomes the state your application works with.

When used within application stacks where mutation-based reactivity is a first-class concept ([Webflo](https://github.com/webqit/webflo), [OOHTML](https://github.com/webqit/oohtml), etc.), Live Views integrate even more natively.

Essentially, with `Observer` as the shared vocabulary of change, `result.rows`'s "live state" nature effectively drives reactivity for modern stacks without an explicit subscription.

---

## The Callback Mode

In LinkedQL, live views (`result.rows`) are the high-level interface.
Underneath it is a lower-level commit stream.

You can subscribe to this stream directly and maintain your own state store.
This is useful if you’re building a custom cache, or replication layer.

```js
const q = `
SELECT id, title
  FROM posts
  ORDER BY created_at DESC`;

const liveHandle = await client.query(q, (commit) => {
    console.log(commit);
}, { live: true });
```

In this mode:

+ all changes are observed from the callback alone as events
+ `result.rows` represents only the initial result of the query, and behaves as a static result set instead of a live object
+ `result.mode` is set to `'callback'` – indicating the delivery mode

Compared to the default live view concept, custom event handling sits closer to the wire.

### The Event Stream

The live query event stream is made of three event types:

| Event    | Meaning                                                            |
| :------- | :----------------------------------------------------------------- |
| `diff` (`commit.type === 'diff'`)   | Incremental inserts, updates, and deletes                          |
| `swap` (`commit.type === 'swap'`)   | Positional swaps that satisfy an `ORDER BY` clause                 |
| `result` (`commit.type === 'result'`) | A new snapshot of the query result                               |

```js
const liveHandle = await client.query(q, (commit) => {
    if (commit.type === 'diff') for (const e of commit.entries) mutationState(e);
    if (commit.type === 'swap') applySwaps(commit.entries);
    if (commit.type === 'result') replaceState(commit.rows, commit.hashes);
}, { live: true });
```

### The `diff` Event

A typical `diff` event contains one or more entries describing result-level changes.

```js
{
  txId,
  type: 'diff',
  entries: [...],
}
```

+ `txId` is the ID of the transaction
+ `entries` is an array of one or more change descriptors

#### `insert` Descriptor

```js
{
  op: 'insert',
  new: { id: 1, name: 'Ada' },
  newHash: '[[1]]',
}
```

#### `update` Descriptor

```js
{
  op: 'update',
  old: { id: 1, name: 'Ada' },
  new: { id: 1, name: 'Ada Lovelace' },
  oldHash: '[[1]]',
  newHash: '[[1]]',
}
```

#### `delete` Descriptor

```js
{
  op: 'delete',
  old: { id: 1, name: 'Ada Lovelace' },
  oldHash: '[[1]]',
}
```

The hashes are the stable result-level row identifiers.

### The `swap` Event

This event contains positional swaps that satisfy an `ORDER BY` clause.

```js
{
  txId,
  type: 'swap',
  entries: [...],
}
```

+ `txId` is the ID of the transaction
+ `entries` are pairs of positional swaps of rows specified by IDs (the hashes):

```js
[
  ['[[3]]', '[[1]]'],
  ['[[1]]', '[[3]]'],
]
```

The above should have a re-ordering effect like:

```text
[row1, row2, row3] -> [row3, row2, row1]
```

### The `result` Event

This event represents a new snapshot of the query result – for when diffrential updates aren't feasible for the query type. This typically happens with queries with aggregates.

```js
{
  txId,
  type: 'result',
  rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Jane' }],
  hashes: ['[[1]]', '[[2]]']
}
```

+ `txId` is the ID of the transaction
+ The `rows` and `hashes` array have the exact same meaning as the standard result's `rows` and `hashes`.

The handler is expected to replace local state with the new result.

---

## The Two-Mode Consumption Model

The "callback" mode above and the default "live view" mode give you two ways to consume live queries.
This is by design. And each caters to two very different needs:

* **Live views**: state-based consumption
* **The callback mode**: event-based consumption

A live view literally translates the event stream into application-ready state.

A callback opts out of that and in to the stream itself to manually interprete events.

---

## Stable Subscription Slots

You can attach an id to a subscription:

```js
const result = await db.query(
  'SELECT * FROM posts ORDER BY id',
  { live: true, id: 'posts_slot' }
);
```

An ID gives the query a durable slot identity, and LinkedQL binds that subscription to the same slot each time it is recreated with the same id.

### Behaviour

With a durable slot identity, the runtime is able to resume from the same logical slot on requeries:

- delivers commits that were missed while subscriber was away
- continues into the current commit stream

On resuming from a previous state, the following happens:

- previous initial snapshot isn't redelivered; consequently...
- `result.rows` is empty
- `result.initial` is `false`

That matters when live queries back application caches, replicas, sync workers, or long-lived UI sessions that must continue from a known point rather than restarting blindly from "now."

### Example

The query below has a stable slot ID.

`commits` is the array of changes observed over the query.

```js
const commits = [];

const result = await db.query(
  'SELECT * FROM posts ORDER BY id',
  (commit) => commits.push(commit),
  { live: true, id: 'posts_slot' }
);
```

On executing the following, we get one commit event that describes two operation – `INSERT`, `UPDATE`:

```js
await db.query(`
  BEGIN;
  INSERT INTO public.posts (id, title) VALUES (1, 'Hello');
  UPDATE public.posts SET title = 'Hello World' WHERE id = 1;
  COMMIT;
`);
```

After we abort, subsequent operations made while away are cached on the slot:

```js
await result.abort();

await db.query(`DELETE FROM public.posts WHERE id = 1`);
```

On re-issuing the query with the same slot ID, event delivery is resumed from last known state:

```js
const result = await db.query(
  'SELECT * FROM posts ORDER BY id',
  (commit) => events.push(commit),
  { live: true, id: 'posts_slot' }
);
```

- the missed `delete` operation is delivered
- `result.rows` is empty
- `result.initial` is `false`
- the slot is drained as the subscriber catches up over time

---

## Dropping Slots

To drop the slot itself, pass `{ forget: true }` to the `abort()` call:

```js
await result.abort({ forget: true });
```
---

## Visibility and Security

In many applications, access control and visibility policies are not enforced in application code. They are pushed into the database layer itself – e.g. via PostgreSQL's **Row-Level Security (RLS)**. The database decides which rows exist for a given query.

Live queries issued within these policy contexts have the same behaviour as a regular query in that context. If a query would normally be subject to access control — whether through session variables, role-based permissions, or database-enforced policies — a Live Query does not bypass or reinterpret that logic. It executes *as-is*, under the exact same constraints.

That means there is no separate “realtime permission layer” to reason about. Whatever determines visibility for a one-off `SELECT` is the same thing that determines visibility for a Live Query — both at initial execution and at every subsequent internal re-evaluation.

**RLS** is where this model becomes concrete. Policies are defined at the table level and automatically applied to every query, based on the current execution context — typically the active role or session configuration.

The general idea is: enable RLS on a table, create the policies:

```js
await db.query(`
  ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "users can see their own posts"
  ON public.posts
  USING (author_id = current_setting('claims.user_id')::text);
`);
```

That context (`claims.user_id` in this example) can be established in different ways depending on how you structure your system.

At the connection/session level:

```js
await db.query(
  `SELECT set_config('claims.user_id', 'user_abc_123', true)`
);

const rows = await db.query(
  `SELECT id, title FROM public.posts`
);
```

Or through role assumption:

```js
await db.query(`SET ROLE app_user`);

const rows = await db.query(
  `SELECT id, title FROM public.posts`
);
```

Or any combination of both.

In however the context is set, every query is implicitly evaluated under that policy

Live Queries don’t introduce a new visibility model here — they inherit this one entirely.

### Policy-Driven Transactions

While the approach above establishes the policies at a global level for every query, a tighter pattern is to move that context into a transaction.

Here, transactions become the unit where context is defined and consumed. The boundary is smaller, explicit, and composable — especially in systems where connections are pooled or reused.

When a live query is run within a transaction, the Live Query engine operates inside that transaction. As a result, it inherits the same security constraints that may have been applied to the transaction.

This is the same idea as before, just scoped differently:

```js
const tx = await db.begin();

await db.query(
  `SELECT set_config('claims.user_id', 'user_abc_123', true)`,
  { tx }
);

const result = await db.query(
  `SELECT id, title FROM public.posts ORDER BY id`,
  { live: true, tx }
);
```

Above:

* the context is established inside the transaction
* the Live Query is created inside that same transaction

The engine stays scoped to the transaction, and every update pushed to the client reflects only what that context is allowed to see.

So while connection-level policy says:

> "the database as seen through this connection"

transaction-level policy says:

> "the database as seen through this transaction"

That shift in scope is what makes the model predictable under concurrency and reuse.

### Relationship to the Commit Stream

Under the hood, Live Queries are powered by the same commit stream that powers commit-level subscriptions at [`db.wal.subscribe()`](/realtime/changefeeds).

But the visibility model is intentionally different.

* Changefeeds expose **raw commit entries**. It's concerned with **rows that changed**. Visibility rules are enforced via explicit filtering – at `resolveCommitVisibility()`
* Live Queries expose **state**. It's concerned with **query results**. Visibility is enforced by the query context

With visibility naturally enforced by the query context for live queries, Live-Query-originated subscriptions are **not passed through `resolveCommitVisibility()` by default**. Applying row-level filtering through that model would be redundant and wasteful.

### Optional Commit-Level Gating

That said, Live Queries can still participate in commit-level visibility control when needed. The use-case is different:

* for controlling what the Live Query engine *itself* sees
* while the engine's own query context controls visibility for the user

The `centralizeCommitVisibility` flag is used opt in to this layered visibility model:

```js
const db = new PGClient({
  centralizeCommitVisibility: true,
  resolveCommitVisibility: async (entries, sub) => {
    if (sub.liveQueryOriginated) {
      // Subscription originated from a Live Query
    }

    // Normal changefeed subscription
    return entries;
  },
});
```

Live-Query-originated subscriptions will be routed through this handler — each carrying `sub.liveQueryOriginated === true`.

The handler is expected to handle Live-Query-originated subscriptions differently than regular subscriptions.

Good use cases include:

* suppressing entire tables, like sensitive relations (e.g. `audit_log`), from ever reaching any subscriber – including the Live Query engine
* enforcing column- or relation-level access rules at a coarse-grained level

```js
const db = new PGClient({
  centralizeCommitVisibility: true,
  resolveCommitVisibility: async (entries, sub) => {
    if (sub.liveQueryOriginated) {
      // Coarse-grained filtering only
      return entries.filter(
        (entry) => entry.relation.name !== 'audit_log'
      );
    }

    // Normal fine-grained filtering
    return entries;
  },
});
```

Above, there is a single source of truth for a certain level of visibility for both regular subscriptions and Live-Query-originated subscriptions.

What you should avoid for Live-Query-originated subscriptions is re-implementing row-level visibility lookups inside the hook (e.g. querying the database per entry). The Live Query engine's query context already serves that need.

---

## Scaling Behaviour

Live queries in LinkedQL are built on a shared execution model that drastically minimizes computation and database lookup costs. When one or more queries overlap, the engine organizes them into a **hierarchy of evaluation windows**.

In this model, a broader query becomes a **canonical query window**, and any overlapping or more constrained queries become **derived windows** that inherit from that base.

This is called **query inheritance**.

To see how it works, suppose all five queries below are recieved by the Live Query engine:

```sql
SELECT * FROM users;
SELECT id, name FROM users;
SELECT * FROM users ORDER BY created_at DESC;
SELECT * FROM users LIMIT 20 OFFSET 40;
SELECT * FROM users WHERE active = true;
```

The first statement establishes the canonical query window for `users`.

The remaining queries form derived windows. They do not re-run the base query. Instead, they inherit the base's result stream and apply additional shaping rules:

* column projection (`SELECT id, name`)
* filtering (`WHERE active = true`)
* ordering (`ORDER BY created_at DESC`)
* slicing (`LIMIT / OFFSET`)

Inheritance works retroactively such that as new queries come, the broadest query is promoted to canonical status while the others inherit.

The result is that **database lookups and computations, like diffing, are restricted to a single window**. Other windows simply operate on the result of their parent window.

This is what makes live queries even tractable on mainstream databases like PostgreSQL in the first place.

::: tip Deep Dive
The mechanics of the engine are covered in the [LinkedQL Realtime Engineering Paper](/engineering/realtime-engine).
:::

### Cost Profile

Without query inheritance, each live query is evaluated independently whenever the underlying data changes.

With query inheritance, the canonical window is evaluated once, and derived windows reuse its result stream.

In other words:

* one change to `users` produces one base evaluation
* all derived windows are updated from that shared result

Result:

10,000 users subscribed to variations of `users` still all converge on the same canonical query window:

* 10,000 subscriptions
* = one canonical evaluation with derived updates

**Cost in LinkedQL is a function of query diversity, not subscription count.**

### Inheritance Boundaries

Query inheritance only applies when queries exist within the same execution boundary.

Inheritance is evaluated only after confirming that queries share the same boundary conditions.

This boundary is defined by the factors below:

#### Structural equivalence

Queries must match in structure.

Matching is based on **query intent**, not just formatting or syntactic equivalence.

#### Parameter equivalence

All query parameters must match exactly.

Any difference in parameter values creates a separate execution boundary, even when the SQL structure is identical.

#### Execution context

Queries must share the same transaction context – for transaction-scope queries.

This ensures inheritance does not cross transactional or policy boundaries — including RLS rules, visibility constraints, or session-level enforcement tied to transaction contexts.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the internals of the Live Query engine | [LinkedQL Realtime Engineering](/engineering/realtime-engine) |
| the related subscription model | [Changefeeds](/realtime/changefeeds) |
| the transaction API in detail | [Transaction API](/api/transaction) |
| the query API in detail | [Query API](/api/query) |

---

## Appendix A — Implied Schema and Dialect

The examples in this document assume a simple illustrative schema and a specific SQL dialect.

### Default Dialect

Unless otherwise noted, all examples assume the **PostgreSQL** syntax and semantics.<br>
Equivalent behavior applies across other SQL dialects (e.g., MySQL, MariaDB) **where supported**.

### Reference Schema

The following minimal schema underpins most examples:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES users (id),
  created_at TIMESTAMP DEFAULT NOW()
);
```
