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

See the [Guides](/guides/#enabling-realtime) section for setup details by runtime.

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

This makes `result.rows` observable like any object.

```js
Observer.observe(result.rows, (mutations) => {
    console.log(`${mutations[0].type}: ${mutations[0].key} = ${mutations[0].value}`);
});
```

You pass a callback, as shown above, to observe root-level changes — which, for `result.rows`, means row additions and deletions.

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

Live Views are designed to directly drive application-level reactivity. They come from the database layer as **reactive state** that are themselves **observable**.

That removes an entire layer of work:

* no **event-to-state mapping** layer
* no **reducers** or **reconciliation logic**
* no risk of state drifting from the source of truth

The database result itself becomes the state your application works with.

Here, the result object flows through your application as a regular object, your application logic directly reacts to its changes.

```js
Observer.observe(result.rows, (mutations) => {
    console.log(mutations);
});
```

When used within application stacks where mutation-based reactivity is a first-class concept, Live Views integrate even more natively.

For example:

+ reactivity in frameworks like [Webflo](https://github.com/webqit/webflo) is driven both on the backend and on the frontend – universally – by live states.
+ reactivity on the UI via [OOHTML](https://github.com/webqit/oohtml) can be driven entirely by live state.

Essentially, with Observer as the shared vocabulary of change, `result.rows`'s "live state" nature can effectively drive reactivity universally for modern stacks without an explicit subscription.

For older stacks, a minimal, explicit subscription line – `Observer.observe()` – helps you acheive the same.

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
+ `result.rows` represents only the initial result of the query, and behaves as a static result set as against a live object
+ `result.mode` is set to `'callback'` – indicating the consumption mode

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
  type: 'diff',
  entries: [...],
  ...commitMeta
}
```

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
  type: 'swap',
  entries: [...],
  ...commitMeta
}
```

Entries are pairs of positional swaps by ID (the hashes):

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
  type: 'result',
  rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Jane' }],
  hashes: ['[[1]]', '[[2]]']
  ...commitMeta
}
```

The `rows` and `hashes` array have the exact same meaning as the standard result's `rows` and `hashes`.

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

That id is more than a label. It gives the query a durable slot identity, and LinkedQL binds that subscription to the same slot each time it is recreated with the same id.

### Behaviour

With a durable slot identity, the runtime:

- is able to resume from the same logical slot on requeries
- catches the subscriber up on commits that were missed while away
- continues emitting to the subscriber from that state

State continuity also means:

- previous initial snapshot isn't redelivered; consequently...
- `result.rows` is empty
- `result.initial` is `false`

That matters when live queries back application caches, replicas, sync workers, or long-lived UI sessions that must continue from a known point rather than restarting blindly from "now."

### Example

```js
const commits = [];

const result = await db.query(
  'SELECT * FROM posts ORDER BY id',
  (commit) => commits.push(commit),
  { live: true, id: 'posts_slot' }
);

await db.query(`
  BEGIN;
  INSERT INTO public.posts (id, title) VALUES (1, 'Hello');
  UPDATE public.posts SET title = 'Hello World' WHERE id = 1;
  COMMIT;
`);

await result.abort();

await db.query(`DELETE FROM public.posts WHERE id = 1`);
```

What happens:

- you get one commit event containing two diffs: `insert` and `update`
- you called `result.abort()` and don't get the second commit

```js

const result = await db.query(
  'SELECT * FROM posts ORDER BY id',
  (commit) => events.push(commit),
  { live: true, id: 'posts_slot' }
);
```

What happens now:

- you re-subscribed to the same subscription slot
- you get the one commit event you missed: `delete`
- `result.rows` is empty
- `result.initial` is `false`

---

## Dropping Slots

To drop the slot itself, pass `{ forget: true }` to the `abort()` call:

```js
await result.abort({ forget: true });
```
## Visibility and Security

Live Queries follow the same fundamental rule as any SQL query where **visibility is policy-driven**. A live query run within a policy-driven context fulfills the same contract as a normal query within that same context.

Transactions are the primary way to define that context.

### Policy-Driven Execution

When you run a Live Query within a policy-bound transaction, the Live Query engine operates inside that same transaction. As a result, every re-evaluation of the query runs under the exact same security constraints – inheriting the visibility rules active at that time.

In systems like PostgreSQL, this pairs directly with **Row-Level Security (RLS)**.

That typically looks like this:

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

Here:

* the transaction establishes the security context (`claims.user_id`). How you establish that context will depend on you. Regardless:
* the Live Query runs inside that context
* every update pushed to the client reflects only what that context is allowed to see

The result stream stops being a simple "updates to this query" — it becomes:

> "updates to this query as visible under this policy"

That distinction is the entire model.

### Relationship to the Commit Stream

Under the hood, Live Queries are powered by the same commit stream that powers commit-level subscriptions via `db.wal.subscribe()`.

But the visibility model is intentionally different.

* Changefeeds expose **raw commit entries**. Visibility rules are enforced via explicit filtering – `resolveCommitVisibility()`
* Live Queries expose **query results**; driven by the same commit stream but work at a higher-level. Visibility is enforced by the query execution itself via transactions

Because of that, Live-Query-originated subscriptions are **not passed through `resolveCommitVisibility()` by default**. Re-applying row-level filtering at the commit level would be redundant and wasteful.

The engine already enforces visibility by re-running the query under the given context.

### Optional Commit-Level Gating

That said, Live Queries can still participate in commit-level visibility control when needed. The effect would be:

+ controlling what the Live Query engine itself sees
+ while the engine's own execution model controls visibility for the user

To centralize commit-level visibility at `resolveCommitVisibility()` this way, the `centralizeCommitVisibility` flag is set to `true`:

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

Live-Query-originated subscriptions will be routed through the same hook — with `sub.liveQueryOriginated === true`.

The `resolveCommitVisibility()` handler is expected to handle Live-Query-originated subscriptions at a more coarse-grained level than regular subscriptions.

Good use cases include:

* blocking entire tables from ever reaching the Live Query engine
* suppressing sensitive relations (e.g. `audit_log`)
* enforcing column- or relation-level access rules

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

    // Normal changefeed behavior
    return entries;
  },
});
```

What you should avoid for Live-Query-originated subscriptions is re-implementing row-level visibility lookups inside the hook (e.g. querying the database per entry). The Live Query engine's default behaviour already guarantees correctness at that level.

### Mental Model

A clean way to think about the split is:

* **Changefeeds:** "What changed in the database?"  
   → optional visibility enforcement: `resolveCommitVisibility()`

* **Live Queries:** "What changed at the level of this query?"  
  → visibility enforcement: transactions

* **Cross-cutting visibility questions:** "What commit-level rules apply in both cases?"  
  → visibility enforcement: `resolveCommitVisibility()` + `centralizeCommitVisibility: true`

---

## Scaling Model

Live queries in LinkedQL are built on a shared execution model that drastically minimizes computation and database lookup costs. When one or more queries overlap, the engine organizes them into a **hierarchy of evaluation windows**.

In this model, a broader query becomes a **canonical query window**, and any overlapping or more constrained queries become **derived windows** that inherit from the base.

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

The remaining queries are derived windows. They do not re-run the base query. Instead, they inherit its result stream and apply additional shaping rules:

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

In other words:

10,000 users subscribed to variations of `users` still all converge on the same canonical query window:

* 10,000 subscriptions
* = one canonical evaluation with derived updates

**Cost in LinkedQL is a function of query diversity, not subscription count.**

### Inheritance Boundaries

Query inheritance only applies when queries exist within the same execution boundary.

Inheritance is evaluated only after confirming that queries share the same boundary conditions.

This boundary is defined by:

#### Structural equivalence

Queries must match in structure.

This ensures inheritance is based on query intent, not just formatting or syntactic variation.

#### Parameter equivalence

All query parameters must match exactly.

Any difference in parameter values creates a separate execution boundary, even when the SQL structure is identical.

#### Transaction context

Queries must share the same transaction or visibility scope.

This ensures inheritance does not cross transactional or policy boundaries — including RLS rules, visibility constraints, or any session-level enforcement tied to the transaction context.

#### In practice

Query inheritance is not a global optimization layer. It is strictly scoped to a single execution boundary in which canonical and derived query windows are allowed to exist.

Within that boundary:

* execution does not leak across parameterized queries
* transactional policies remain consistently enforced across all derived windows
* structural overlap is only exploited when visibility context is identical

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the related changefeed subscription model | [Query API](/realtime/changefeeds) |
| the `query()` in API detail | [Query API](/api/query) |
| the transaction API in detail | [Transaction API](/api/transaction) |

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
