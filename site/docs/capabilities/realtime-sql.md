# Realtime SQL

*Turn on reactivity over arbitrary SQL with `{ live: true }`.*

```js
const result = await client.query(`SELECT * FROM posts`, { live: true });
```

You get back a *live view* of your query — in realtime.

## General Idea

Live queries are a first-class concept in LinkedQL.
They happen over the same `client.query()` API.

The `.query()` method does what you expect. But for a `SELECT` query, it also works in **live mode**:

```js
const result = await client.query(`SELECT * FROM posts`, { live: true });
```

In live mode, the query stays **open** and `result.rows` becomes a self-updating result set — a **live view**.

It remains a normal JavaScript array:

```js
console.table(result.rows);
console.log(result.rows.length); // 4
```

…but live:

```sql
INSERT INTO posts (title) VALUES ('Post A');
```

```js
console.table(result.rows);
console.log(result.rows.length); // 5
```

`result.rows` will grow, shrink, and mutate to reflect the latest truth of the query as changes happen to the underlying database. This applies to any SQL query — joins, aggregates, subqueries, even derived tables.

Live mode can be stopped explicitly:

```js
result.abort();
```

That ends reactivity; the array stops updating.

Above, `result` is [`RealtimeResult`](../../docs/query-api#realtimeresult).

> [!IMPORTANT]
> To run live queries on PostgreSQL, MySQL, MariaDB be sure to follow the [setup instructions](../setup) for the database.

::: tip Deep Dive
The mechanics of the Realtime Engine is covered in the [LinkedQL Realtime Engineering Paper](/engineering/realtime-engine)
:::

## Realworld Overview

An important design goal for LinkedQL is to make reactivity over SQL *a real-world primitive* — used in the wild across arbitrary use cases and database models: server-side, client-side, or hybrid.

LinkedQL’s realtime engine isn’t constrained by query complexity.<br>
If it’s a valid `SELECT`, you can have it live — whether for analytics dashboards, collaborative applications, or live feeds.

Below are typical scenarios, with a summary, each, of their *live view* behaviour.

### _Analytics Dashboards_

A live metric board where aggregates and rollups update incrementally as source data changes.

— _Totals and subtotals rebalance in place as orders stream in. Charts update directly from the live view._

```sql
SELECT
  region,
  product,
  SUM(sales) AS total_sales,
  ROLLUP(region, product)
FROM orders
GROUP BY GROUPING SETS ((region, product), (region), ());
```

### _Collaborative Workspaces_

A shared document list showing current editors — a typical join over volatile relationships.

— _When a user opens or leaves a document, the corresponding row simply mutates — the `active_editor` field changes._

```sql
SELECT
  d.id,
  d.title,
  u.name AS active_editor
FROM documents d
LEFT JOIN users u ON d.active_user = u.id;
```

### _Live Feeds_

A user-facing content feed ordered by recency and limited in size.

— _New posts slide into the top of the view; older ones fall off. Ordering and window limits hold continuously._

```sql
SELECT *
FROM posts
ORDER BY created_at DESC
LIMIT 20;
```

### _Leaderboards and Rankings_

Window functions express live ordering logic for competitive or analytic views.

— _Scores accumulate in place; ranks shift smoothly as updates land._

```sql
SELECT
  user_id,
  SUM(score) AS total_score,
  RANK() OVER (ORDER BY SUM(score) DESC) AS rank
FROM scores
GROUP BY user_id;
```

### _Mixed and Derived Sources_

Queries that combine subqueries, derived tables, and inline relations behave the same way.

— _As reactions, comments, or post statuses change, their aggregates merge seamlessly into the main result — a single, continuously consistent view._

```sql
SELECT
  p.id,
  p.title,
  r.reaction_count,
  c.comment_count
FROM posts p
JOIN (SELECT post_id, COUNT(*) AS reaction_count
      FROM reactions GROUP BY post_id) r ON r.post_id = p.id
JOIN (VALUES ('featured'), ('archived')) AS tags(status)
      ON p.status = tags.status
LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count
      FROM comments GROUP BY post_id
) c ON c.post_id = p.id;
```

Essentially, LinkedQL extends reactivity to the full semantic surface of `SELECT` — from the simplest filter to multi-layer analytical compositions.

## Live Views in Detail

`result.rows` is a self-updating array of objects — each element reflecting a row in real time.

For a query like the below:

```js
const result = await client.query(
    `SELECT id, title FROM posts`,
    { live: true }
);
```

You get an initial result:

```js
console.log(result.rows);
```

```text
[A, B, C, D] // initial result
```

When a row is inserted in the database, it appears in the view:

```sql
INSERT INTO posts (title) VALUES ('Hello World');
```

```text
[A, B, C, D, E] // E added
```

When a row is updated in the database, the corresponding row object in the view updates in place:

```sql
UPDATE posts SET title = 'Hello Again' WHERE title = 'Hello World';
```

```text
[A, B, C^, D, E] // C updated
```

When a row is deleted in the database, the corresponding row in the view disappears:

```sql
DELETE FROM posts WHERE title = 'Hello Again';
```

```text
[A, B, D, E] // C deleted
```

Essentially, a *live* view.

### Joins and Composites

For queries that involve a `JOIN` (or many `JOIN`s):

```js
const result = await client.query(
  `SELECT posts.id, posts.title, users.name AS author_name
  FROM posts LEFT JOIN users ON posts.author_id = users.id`,
  { live: true }
);
```

Database-level mutations — `INSERT`, `UPDATE`, or `DELETE` — on either side of a join can affect the **join relationship** itself.<br>
A right-hand or left-hand side that once matched may suddenly match no more, or the reverse may be the case.

This means the result of an event like `INSERT` or `DELETE` may not always mean “add”, or “remove”, a row in the view.
It might instead mean: *a row has transited from "no matching right-hand side" to "fully materialized"*, or the reverse.<br>
This is **Join Transition**.

Join transitions would normally be observed as a "delete" + "add" effect — existing composition dissolves and a new one emerges.
But LinkedQL is designed to detect these phenomena and properly communicate them as **in-place updates**, preserving continuity and identity.

Observers see an in-place update, not a *teardown + recreate* sequence:

#### Example 1 — `INSERT` causes a join to materialize

```sql
INSERT INTO users (id, name) VALUES (42, 'Ada');
```

*Observed effect:* **update** — a row that previously had no right-hand match now becomes fully materialized — same object, new state:

```text
┌──────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: null ─────→ 'Ada' } │
└──────────────────────────────────────────────────────────────┘
```

#### Example 2 — `UPDATE` changes the join relationship

```sql
UPDATE posts SET author_id = 42 WHERE title = 'Untitled';
```

*Observed effect:* **update** — the row persists — only its joined field transitions in place:

```text
┌───────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: 'Bob' ─────→ 'Ada' } │
└───────────────────────────────────────────────────────────────┘
```

#### Example 3 — `DELETE` dissolves the join

```sql
DELETE FROM users WHERE id = 42;
```

*Observed effect:* **update** — the join dissolves — the row remains but loses its right-hand match:

```text
┌──────────────────────────────────────────────────────────────┐
│ { id: 1, title: 'Untitled', author_name: 'Ada' ─────→ null } │
└──────────────────────────────────────────────────────────────┘
```

*Overal:* identity persists.

Essentially, LinkedQL interprets database mutations through the lens of query semantics —
thus, join compositions remain continuous relationships over time.

### Frames and Ordinality

Queries that have ordering, limits, or offsets applied are materialized with the semantics of each modifier automatically maintained in the view.

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

Then on "_`INSERT` a new row `N`_":

```text
[N, A, B, C, D]   // N enters the view; E falls off because it’s now #6
```

Then on "_`UPDATE` a post’s `created_at`_":

```text
[N, A, C, B, D]   // C and B swap places without initiating a full re-ordering
```

Essentially, ordering and slicing remain stable relationships — they evolve as data changes, without recomputation.

### Precision and Granularity

Live updates apply the smallest possible change needed to keep the view correct. This reflects a key design goal in LinkedQL: precision and granularity.

This guarantees two things:

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

Precision and granularity help keep costs low across consumers bound to the view. When rendering on the UI, for example:

* The UI maintains state, avoids unnecessary rerenders, and never flickers.
* Components keyed by row identity keep their state.
* You don’t lose scroll position.

### Observability and Atomicity

Live views are not just auto-updating — they are also **observable**.

LinkedQL exposes them through the [Observer API](https://github.com/webqit/observer). Observer is a general-purpose JavaScript API for observing object and array-level mutations.

You pass a callback to observe root-level changes — which, for `result.rows`, would mean row additions and deletions:

```js
Observer.observe(result.rows, (mutations) => {
    console.log(`${mutations[0].type}: ${mutations[0].key} = ${mutations[0].value}`);
});
```

To go deeper and observe field-level changes, you use the `Observer.subtree()` directive:

```js
Observer.observe(result.rows, Observer.subtree(), (mutations) => {
    console.log(`${mutations[0].type}: ${mutations[0].key} = ${mutations[0].value}`);
});
```

Observer guarantees that events are delivered with the atomicity of the underlying database transactions. In other words, all mutations that happen inside a single database transaction arrive together in one callback turn.

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

Essentially, you never see half a transaction.

### Live Bindings

LinkedQL’s live views are ordinary JavaScript objects and arrays. They simply happen to mutate over time as the database changes.

And here’s how that plays out across runtimes: because they use the [Observer API](https://github.com/webqit/observer) protocol, you get automatic binding and mutation-based reactivity across contexts or runtimes where mutations are a first-class concept.

For example, with Webflo’s *live response* capability, `result.rows` — like any object — can be returned from a route, with reactivity preserved over the wire.

```js
export default async function(event) {
    const result = await client.query(`SELECT * FROM posts`, { live: true });
    event.waitUntilNavigate(); // Tell Webflo to keep the connection open until the user navigates away
    return { list: result.rows };
}
```

That object materializes on the client-side as the same live object, accessible via `document.bindings.data`:

```html
<script src="https://unpkg.com/@webqit/observer/main.js"></script>
<script>
const { Observer } = webqit;

const data = document.bindings.data;
Observer.observe(data, console.log);
</script>
```

If the goal is to render, that, too, comes automatic: OOHTML gives you automatic data-binding over arbitrary objects and arrays — without a compile step:

```html
<script src="https://unpkg.com/@webqit/oohtml/dist/main.lite.js"></script>
<div><?{ data.list.length }?></div>
```

The UI updates as posts are added or removed — with no glue code. (List rendering has been omitted here for brevity. Try updating the posts table from a terminal to see the UI update the total count.)

Essentially, with the Observer protocol as the shared vocabulary of change, continuity stays intact from database to DOM. Each layer in the chain — LinkedQL → Webflo → OOHTML — simply makes or reacts to mutations.

## Event Callbacks

In LinkedQL, live views (`result.rows`) are the high-level interface.
Underneath it is a lower-level event stream.

That event stream is made of three event types:

| Event    | Meaning                                                            |
| :------- | :----------------------------------------------------------------- |
| `result` | A full snapshot of the query result.                               |
| `diff`   | Incremental inserts, updates, and deletes.                         |
| `swap`   | Positional swaps that satisfy an `ORDER BY` clause                 |

You can subscribe to these events directly and maintain your own state store.
This is useful if you’re building a custom cache, animation layer, or replication layer.

```js
// Get a handle to the live query
const liveHandle = await client.query(
  `SELECT id, title
  FROM posts
  ORDER BY created_at DESC`,
  handle,
  { live: true }
);
```

```js
// Attach a listener to the handle’s event emitter
const hashes = [];
const rows = [];

function handle(eventName, eventData) {

    if (eventName === 'diff') {
        for (let event of eventData) {
            if (event.type === 'update') {
                const i = hashes.indexOf(event.oldHash);
                if (i > -1) {
                    Object.assign(rows[i], event.new);
                    hashes[i] = event.newHash;
                } else {
                    event = { ...event, type: 'insert' };
                }
            }
            if (event.type === 'insert') {
                rows.push(event.new);
                hashes.push(event.newHash);
            }
            if (event.type === 'delete') {
                const i = hashes.indexOf(event.oldHash);
                if (i > -1) {
                    rows.splice(i, 1);
                    hashes.splice(i, 1);
                }
            }
        }
    }

    if (eventName === 'swap') {
        const _rows = rows.slice(0);
        const _hashes = hashes.slice(0);
        for (const [hash, targetHash] of eventData) {
            const i_a = _hashes.indexOf(hash);
            const i_b = _hashes.indexOf(targetHash);
            rows[i_b] = _rows[i_a];
            hashes[i_b] = hash;
        }
    }

    if (eventName === 'result') {
        hashes = eventData.hashes;
        const maxLen = Math.max(rows.length, eventData.rows.length);
        for (let i = 0; i < maxLen; i ++) {
            if (!eventData.rows[i]) {
                rows.splice(i);
                break;
            }
            if (!_eq(eventData.rows[i], rows[i])) {
                rows[i] = eventData.rows[i];
            }
        }
    }
}
```

That logic is conceptually what the built-in [`RealtimeResult`](../../docs/query-api#realtimeresult) does for you internally — but as an atomic operation. It:

* applies `result`, `diff`, and `swap` events;
* preserves ordering and LIMIT/OFFSET semantics;
* exposes the final live state as `result.rows`.

Compared to the default live view concept, custom event handling sits closer to the wire — meant for systems that need explicit control, like caches or replication layers.

## Query Inheritance

Live queries are efficient because LinkedQL does not treat each subscription as an isolated process.
Instead, LinkedQL groups overlapping queries into a shared structure called a **query inheritance tree**.

Example:

```sql
-- Canonical query
SELECT * FROM posts;

-- Derived queries
SELECT * FROM posts WHERE author_id = 1;
SELECT * FROM posts WHERE author_id = 2;
SELECT * FROM posts WHERE author_id = 3;
```

All of these are watching the same underlying table (`posts`).<br>
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
