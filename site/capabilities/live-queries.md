# Live Queries

*Turn on reactivity over arbitrary SQL with `{ live: true }`.*

```js
const result = await db.query('SELECT * FROM posts', { live: true });
```

You get back a live view of your query, in realtime.

## General idea

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

Above, `result` is a [`RealtimeResult`](/docs/query-api#realtimeresult).

> [!IMPORTANT]
> To run live queries on PostgreSQL, MySQL, or MariaDB, be sure to follow the [setup instructions](/docs/setup) for the database.

::: tip Deep Dive
The mechanics of the engine are covered in the [LinkedQL Realtime Engineering Paper](/engineering/realtime-engine).
:::

## Live queries in practice

Live querie have various real-world use cases. Consider the following.

### Analytics dashboards

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

### Collaborative workspaces

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

### Live feeds

A user-facing feed ordered by recency and limited in size.

```sql
SELECT *
FROM posts
ORDER BY created_at DESC
LIMIT 20;
```

Here the live result keeps representing "the newest twenty posts", not anymore "the twenty posts that happened to be present at first render."

Observed effect: new posts slide into the top of the view; older ones fall off. Ordering and window limits continue to hold.

### Rankings and leaderboards

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

### Mixed and derived sources

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

## Live views in detail

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

## Joins and join transitions

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

A table-level mutation may affect only the right-hand or left-hand side of a join. That may mean that a right-hand or left-hand side of the join that once matched no longer matches, or the reverse. In LinkedQL, this is treated as Join Transition.

By default, certain join transitions should cause the corresponding old row in the view to disappear and be regained as a new row. But that would break continuity and identity. LinkedQL prevents that by handling these transitions specially to preserve identity and continuity.

The observed effect is: stable rows that simply mutate in-place in however the underlying tables change.

### Scenario 1: a join materializes after an INSERT

Suppose a post already exists with an `author_id: 42`, but the matching user row does not yet exist. The following INSERT would materialize the join:

```sql
INSERT INTO users (id, name) VALUES (42, 'Bob');
```

The observed effect in the view is that the existing row now gains a right-hand match.

```js
┌──────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: null ─────→ 'Bob' } │
└──────────────────────────────────────────────────────────────┘
```

### Scenario 2: the join relationship changes after an UPDATE

Suppose `author_id` is updated to point to another user. That would change the join relation.

```sql
UPDATE posts SET author_id = 43 WHERE title = 'Untitled';
```

The observed effect becomes:

- the row persists
- the joined field changes
- continuity is preserved

```js
┌───────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: 'Bob' ─────→ 'Ada' } │
└───────────────────────────────────────────────────────────────┘
```

### Scenario 3: the join dissolves after a DELETE

Suppose the current right-hand match is deleted. That would dissolve the relationship.

```sql
DELETE FROM users WHERE id = 43;
```

The observed effect becomes: the corresponding row remains in the view but loses its right-hand match.

```js
┌──────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: 'Ada' ─────→ null } │
└──────────────────────────────────────────────────────────────┘
```

Overall effect: identity persists. The view stays true to join semantics without leaking low-level mutation shape into the result model.

### Frames and Ordinality

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

This view will _always_ represent “the newest 5 posts” across `INSERT` and `DELETE` operations.

Initially:

```text
[A, B, C, D, E] // initial result
```

Then on "_`INSERT`ing a new row `N`_":

```text
[N, A, B, C, D]   // N enters the view; E falls off because it’s now #6
```

Then on "_`UPDATE`ing a post’s `created_at` field and promoting it one step higher in the list_":

```text
[N, A, C, B, D]   // C and B swap places without initiating a full re-ordering
```

Essentially, ordering and slicing remain stable relationships — they evolve as data changes, without recomputation.

### Precision and Granularity

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

When the effect of an operation is simply a change in position (for queries with an `ORDER BY` clause), the view isn't re-ordered in full. Instead, the engine issues a positional `swap` event: “swap B and C”

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

### Observability and Atomicity

Live views are not just auto-updating — they are also **observable**.

LinkedQL exposes them through the [Observer API](https://github.com/webqit/observer). Observer is a general-purpose JavaScript API for observing object and array-level mutations.

This makes `result.rows` observable like any object.

```js
Observer.observe(result.rows, (mutations) => {
    console.log(`${mutations[0].type}: ${mutations[0].key} = ${mutations[0].value}`);
});
```

You pass a callback, as shown above, to observe root-level changes — which, for `result.rows`, would mean row additions and deletions:

You observe field-level changes by adding the `Observer.subtree()` directive:

```js
Observer.observe(result.rows, Observer.subtree(), (mutations) => {
    console.log(`${mutations[0].type}: ${mutations[0].key} = ${mutations[0].value}`);
});
```

LinkedQL leverages Observer's batching feature to preserve the atomicity of the database transactions behind the emitted events. It guarantees that all mutations that happen inside a single database transaction arrive together in one callback turn.

For example:

```sql
BEGIN;
UPDATE posts SET title = 'Pinned' WHERE id = 3;
UPDATE posts SET title = 'Pinned' WHERE id = 4;
COMMIT;
```

Observer will fire once, with a batch containing both updates:

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

Essentially, transactions aren't torn across multiple emissions.

### Live Bindings

LinkedQL’s live views are ordinary JavaScript objects and arrays. They simply happen to mutate over time as the database changes.

Those mutations themselves are the basis for reactivity in the design. Because they happen via the [Observer API](https://github.com/webqit/observer) protocol, you get automatic binding and mutation-based reactivity across contexts or runtimes where mutations are a first-class concept.

For example, with the[ Webflo framework](https://github.com/webqit/webflo)’s *[live response](https://webflo.netlify.app/docs/concepts/realtime#live-responses)* capability, `result.rows` — like any object — can be returned from a route as live response, with reactivity preserved over the wire.

```js
export default async function(event) {
    const result = await client.query(`SELECT * FROM posts`, { live: true, signal: event.signal });
    event.waitUntilNavigate(); // Tell Webflo to keep the connection open until the user navigates away
    return { posts: result.rows };
}
```

That object materializes in the client as the same live object, which in Webflo is accessible via `document.bindings.data`:

```html
<script src="https://unpkg.com/@webqit/observer/main.js"></script>
<script>
const { Observer } = webqit;

const data = document.bindings.data;
Observer.observe(data, console.log);
</script>
```

These live objects automatically bind to UI in any mutation-based data-binding framework like [OOHTML](https://github.com/webqit/oohtml). OOHTML is an addition to the DOM that brings mutation-based reactivity to the UI — without a compile step:

```html
<script src="https://unpkg.com/@webqit/oohtml/dist/main.lite.js"></script>
<div><?{ data.list.length }?></div>
```

The UI in this example updates as posts are added or removed — with no glue code. (List rendering has been omitted here for brevity.)

> [!TIP]
> Try updating the posts table from a terminal to see the UI update the total count.

Essentially, with the Observer protocol as the shared vocabulary of change, continuity stays intact from database to DOM. Each layer in the chain — LinkedQL → Webflo → OOHTML — simply makes or reacts to mutations.

## Event Callbacks

In LinkedQL, live views (`result.rows`) are the high-level interface.
Underneath it is a lower-level event stream.

That event stream is made of three event types:

| Event    | Meaning                                                            |
| :------- | :----------------------------------------------------------------- |
| `result` (`commit.type === 'result'`) | A full snapshot of the query result – for when diffrential updates aren't feasible for the qiven query – typically queries with aggregates.                               |
| `diff` (`commit.type === 'diff'`)   | Incremental inserts, updates, and deletes.                         |
| `swap` (`commit.type === 'swap'`)   | Positional swaps that satisfy an `ORDER BY` clause                 |

You can subscribe to these events directly and maintain your own state store.
This is useful if you’re building a custom cache, or replication layer.

```js
const commits = [];

// Get a handle to the live query
const liveHandle = await client.query(
  `SELECT id, title
  FROM posts
  ORDER BY created_at DESC`,
  (commit) => commits.push(commit),
  { live: true }
);
```

Compared to the default live view concept, custom event handling sits closer to the wire.

## Stable subscription slots

You can attach an id to a subscription:

```js
const result = await db.query(
  'SELECT * FROM posts ORDER BY id',
  { live: true, id: 'posts_slot' }
);
```

The id gives the live query a stable slot identity.

When the query is re-issued with the same id, LinkedQL binds it to that same slot and:

- looks up the last commit successfuly consumed by the subscriber
- catches the subscriber up on missed-but-cached commits
- continue emitting to the subscriber from there

With stable slot IDs, a live query stops being a disposable one-off subscription and becomes a resumable data channel with continuity across disconnects.

To drop the slot itself, pass `{ forget: true }` to the `abort()` call:

```js
await result.abort({ forget: true });
```

## Query inheritance and scaling

Live queries are efficient because LinkedQL does not have to treat each subscription as an isolated process.

When queries overlap strongly, LinkedQL can share work instead of recomputing each subscription independently for every listener.

For example:

```sql
SELECT * FROM posts;
SELECT * FROM posts WHERE author_id = 1;
SELECT * FROM posts WHERE author_id = 2;
SELECT * FROM posts WHERE author_id = 3;
```

These are not four unrelated realtime systems. They overlap heavily around the same underlying relation.

Instead of running three (or four) separate live computations, LinkedQL maintains a single canonical “posts” stream and lets each narrower query filter from it.

This applies not only to filters, but also to slices like `ORDER BY … LIMIT …`, projections, and other refinements that can be derived locally.

The benefit is twofold:

1. **Work is shared.** A row change from the database is processed once, then fanned out to all relevant derived views.
2. **State stays consistent.** Every subscriber downstream sees the same truth, because they inherit from the same canonical source.

### Scaling Behavior

Traditional realtime systems (GraphQL subscriptions, ad-hoc changefeeds, client-side replicas) recompute each subscription independently.
Cost scales with the number of listeners.

LinkedQL avoids that.

LinkedQL’s cost scales with **query diversity** — the number of distinct canonical queries currently in play — not with the number of subscribers.

Put differently:

* 10,000 users watching variations of `SELECT * FROM posts` still converge to one canonical stream of `posts`.
* Each user’s filtered/sorted/limited view is derived from that stream instead of being recomputed from scratch.

Essentially, thanks to query inheritance; the system does not explode as the audience grows. Reactivity over SQL remains, not just feasible, but efficient over traditional database connections.

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
