# Federation, Materialization, and Sync

FlashQL can compute both local and remote data in **the same query**:

```js
const result = await db.query(`
  SELECT *
  FROM public.local_users u
  JOIN public.remote_orders o ON o.user_id = u.id;
`);
```

You simply define remote data as local tables (views), and from that point on:

> **all queries treat local and remote data as one relational graph**

You decide how that data behaves locally in one of three modes:

* **federated** — querying the table queries the source directly
* **materialized** — the table is a materialized copy of the source data
* **realtime** — the table materializes and stays in sync with source data

An upstream-backed materialized view, for example, looks like:

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.remote_orders AS
  SELECT * FROM public.orders
  WITH (replication_origin = 'postgres:db1')
`);
```

**Result**: your code sees normal tables as in the query above, FlashQL computes the local + remote data as one relational graph behind the scenes.

## Background

Modern applications almost always need some combination of:

* accessing a remote database from the client – typically
* caching data locally
* working offline
* reacting to live updates
* writing locally and syncing later

To support all of the above in a typical stack, you end up with:

* a database client for normal querying
* a caching layer (manual or framework-driven)
* a sync engine and background job system
* a realtime subscription system
* conflict detection and resolution logic
* retry queues for failed writes

The complexity tends to trump that of the product itself.

## The FlashQL Approach

FlashQL takes a very specific approach:

> extend existing SQL primitives instead of introducing new ones

The same relational surface your app already uses becomes:

* your query interface
* your realtime engine
* your sync engine
* your write coordination layer

Instead of inventing new APIs, FlashQL extends something SQL already has:

> **database views**

## Extending What a View Can Represent

In standard SQL, a view already gives you:

* a way to mirror other tables via a query – and thus...
* a layer of abstraction over real tables
* a way to shape and expose data

FlashQL keeps all of that,

but extends the idea so that a view can reference and project data from foreign origins as if they were local tables.

This single extension is what enables:

- federation
- materialization
- sync

The idea is presented below in conceptual levels.

## Level 1: What a View Is By Itself

In standard SQL, a view is:

> a projection over one or more underlying tables

We’ll call those tables **origin tables**.

```js
await db.query(`
  CREATE VIEW public.posts AS
  SELECT title, content FROM public.blog
`);
```

Here:

* `public.posts` is the view
* `public.blog` is the origin table

When you query the view:

```js
await db.query(`SELECT * FROM public.posts`);
```

the database resolves that query against the origin tables.

That gives a read-through behaviour:

> you query a view and it results in querying its origin tables

The idea round-trips in the case of updatable views:

> you write to a view and it results in writing to its origin table

That in standard SQL already models the replication story that an external replication system would tell: **origin table** -> **projection table**.

but with one obvious limitation:

> views only have the concept of *local* tables – the data from within the database itself

That single limitation is what FlashQL lifts to unlock federation and sync.

## Level 2: Extending Views to Foreign Origins

With a single parameter, a view in FlashQL can be made to reference tables that live outside the local database – **a foreign origin**

```js
await db.query(`
  CREATE VIEW public.posts AS
  SELECT * FROM public.blog
  WITH (replication_origin = 'postgres:db1')
`);
```

As before:

* `public.posts` is the view
* `public.blog` is the origin table
  + but this time in another database identified as `postgres:db1`

That `WITH (replication_origin = ...)` specifier is the part that turns a regular view into a foreign-backed view.

Now when you query the view:

```js
await db.query(`SELECT * FROM public.posts`);
```

the local database resolves that query against the foreign origin.

### The Outcome: Federation

Once a view can point to foreign tables, the existing read-through behaviour now becomes:

> you query a view and it results in querying its external origin tables

The idea round-trips as before as:

> you write to a view and it results in writing to its external origin table

This is:

> **federation**

You get a single SQL surface for both local and remote data:

```js
await db.query(`
  SELECT *
  FROM public.posts
  JOIN public.users ON posts.user_id = users.id
`);
```

### How Upstream Access Works

To talk to the foreign origin, FlashQL relies on an instance of the upstream database client to be passed in. This is supported via a `getUpstreamClient()` factory:

```js
const db = new FlashQL({
  async getUpstreamClient(originId) {
    return new EdgeClient({
      url: '/api/db',
      dialect: 'postgres',
    });
  },
});
```

Here, `EdgeClient` is how the application talks to the foreign database. If the database system were in the same runtime, you could as well use a different client like `PGClient` or `MySQLClient`.

With the above, the local FlashQL instance is now foreign-origin-enabled.

That hook is all the bootstrapping.

Now, when a query touches a foreign-backed view, FlashQL uses the `replication_origin` value to resolve an upstream client via `getUpstreamClient(originId)`.

## Level 3: From Access to Control (View Modes)

Once a view can point to an origin table – whether local or foreign – the next question is:

> how should that data behave at the view level?

SQL natively has two modes for this:

* **runtime resolution** (normal views)
* **materialization** (`materialized` views)

These do answer part of the questions. For the full data retention and synchronization story,
FlashQL introduces the missing third: **realtime** (`realtime` views).

Each of this is covered below.

### Runtime Resolution (Normal Views)

This is the default idea of a view: a table that has no actual rows but a query that executes at run-time.

```js
await db.query(`
  CREATE VIEW public.posts AS
  SELECT * FROM public.blog;
`);
```

Behavior:

* every read and write execute against the origin table
* no data retention

For foreign-backed views,

```js
await db.query(`
  CREATE VIEW public.posts AS
  SELECT * FROM public.blog
  WITH (replication_origin = 'postgres:db1');
`);
```

this means

* every read and write execute against the upstream
* no local/offline retention

Outcome:

> **federation without local state**

### Materialization (`materialized` Views)

For use cases that require data retention on the view, SQL introduces a variant: `materialized` views.

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.posts AS
  SELECT * FROM public.blog;
`);
```

Behavior:

* stores the result and behaves like a table
* can be refreshed to stay up to date
* writes still execute against the local origin table

For foreign-backed views,

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.posts AS
  SELECT * FROM public.blog
  WITH (replication_origin = 'postgres:db1');
`);
```

this means

* upstream data is copied locally and behaves like a table
* reads are local and accessible offline; writes still execute against the foreign origin table
* an explicit refresh updates the snapshot

Outcome:

> **federation + local caching (materialization)**

### Realtime (`realtime` Views)

Standard SQL has no concept of a view that stays continuously synchronized with origin tables.

FlashQL introduces exactly that:

```js
await db.query(`
  CREATE REALTIME VIEW public.posts AS
  SELECT * FROM public.blog;
`);
```

Behavior:

* stores the result and behaves like a table
* automatically stays in sync with its local origin tables
* writes still execute against the local origin table

For foreign-backed views,

```js
await db.query(`
  CREATE REALTIME VIEW public.posts AS
  SELECT * FROM public.blog
  WITH (replication_origin = 'postgres:db1');
`);
```

this means

* upstream data is copied locally and behaves like a table
* reads are local and accessible offline; local writes execute against the foreign origin table
* local state stays continuously aligned with foreign origin tables

Outcome:

> **federation + materialization + sync**

At this point, the database is no longer just storing data.

It is coordinating how data moves between local state and upstream systems.

### View Modes at a Glance

| Mode             | Reads  | Writes         | Local state         | Offline |
| ---------------- | ------ | -------------- | ------------------- | ------- |
| **federated**    | remote | remote         | none                | no      |
| **materialized** | local  | remote (async) | snapshot            | yes     |
| **realtime**     | local  | remote (async) | continuously synced | yes     |

## Level 4: Views as Write Surfaces

Views are not just read surfaces.

When they are "updatable", they become write surfaces as well.

A view is updatable when it:

* maps cleanly to a single origin table
* preserves enough structure for updates to be derived

In FlashQL, this applies both to:

* local-origin views
* foreign-origin views

For an update like:

```js
await db.query(`
  UPDATE public.users SET name = 'Alice' WHERE id = 1;
`);
```

below is the write-through behaviour for each mode.

At this point, a view is no longer just a projection:

> it becomes a write coordination surface between local state and origin state.

### For Runtime Views -> Direct Remote Writes

For runtime (non-materialized) views, a write translates directly to a write on the origin table.

For foreign-backed views, this means federated writes (direct to upstream database).

The success of the local write operation will depend on the success/failure of the upstream call.

### For Materialized and Realtime Views -> Queued Writes

For materialized and realtime views, a write lands first in a queue, and applies to the origin table asynchronously.

For foreign-backed views, the local write operation returns with success – whether the app is currently online or not. The upstream database is written to in the background when online.

Foreign-backed materialized and realtime views thus retain their offline-first behaviour.

## Level 5: Write Policies and Optimistic Writes

Once a view is writeable, you can control how the view reacts to writes to suite various use cases. This applies both to local-backed views and foreign-backed views.

There are two modes supported.

### `origin_first`

This is the default mode.

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.posts AS
  SELECT * FROM public.blog
  WITH (
    replication_origin = 'postgres:db1',
    write_policy = 'origin_first'
  );
`);
```

* The write operation is sent directly to the origin table.
* The view reflects the change only after it is observed from the origin.
* For materialized views, an explicit refresh echoes the change back.
* For realtime views, inbound sync automaticallt echoes the change back.

### `local_first`

This enables optimistic writes.

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.posts AS
  SELECT * FROM public.blog
  WITH (
    replication_origin = 'postgres:db1',
    write_policy = 'local_first'
  );
`);
```

* The write operation applies to the view itself first, then propagates to the origin table in the background.
* For inserts and updates, the local row is marked `__staged = true` and remains so until
* An explicit refresh (in the case of materialized views) or inbound sync (in the case of realtime views) replaces the row with the authoritative row – thus flipping the `__staged` column to `false`.
* For deletes, the local row is deleted.

### What This Enables

This is where the system becomes application-shaped:

* optimistic writes for instant UI updates
* offline editing
* etc.

### By Comparison

These two policies represent a tradeoff:

+ consistency-first (`origin_first`)
+ latency-first (`local_first`)

## Level 6: Conflict Awareness

Once writes can happen offline or concurrently, conflicts are inevitable – especially when there are multiple write sources.

FlashQL as the coordination system makes conflicts a **predictable and observable** phenomena.

This is covered in [Conflicts](/flashql/conflicts).

## The Idea at a Glance

**Extend SQL views just enough, and they become the single primitive for:**

> federation, caching, realtime, and sync

You get an upgrade path from the basic database view to the application-ready database view, with choices around:

* **backing origin** → local or foreign
* **resolution mode** → runtime, materialized, realtime
* **writes** → direct or queued
* **write policy** → origin-first or local-first
* **conflict detection** → MVCC-tags

## Further Reading

* [The Sync API](/flashql/sync-api)
* [Conflict handling](/flashql/conflicts)
* [Integration patterns](/flashql/sync-patterns)

---

## Appendix A: Replication Origin Semantics

### The idea

In FlashQL, a view's `replication_origin` parameter specifies **where its data comes from**.

* It must be a **string**.
* Ideally, it is the upstream database connection string, but for safety, an opaque identifier is recommended where the ideal exposes sensitive connection info.
* A hard requirement is that the string must **start with the upstream dialect**, for example:

```text
postgres:main-db
mysql:analytics
```

* The value can also be the keyword `INHERIT`. In this case, the view does not specify a source directly but **inherits the schema-level default replication origin**. If that default is `null`, the view behaves as a normal local-backed view. If the default is non-null, the view behaves as an upstream-backed view.

### Usage

```sql
-- Explicit origin
CREATE VIEW public.posts AS
SELECT * FROM public.blog
WITH (replication_origin = 'postgres:main-db');

-- Inherited origin
CREATE VIEW public.comments AS
SELECT * FROM public.comments
WITH (replication_origin = INHERIT);
```

### Schema-Level Default

A schema can define a `default_replication_origin` so that multiple views can share the same upstream without repeating it:

```sql
CREATE SCHEMA remote
WITH (default_replication_origin = 'postgres:main-db');
```

or

```sql
ALTER SCHEMA public
SET (default_replication_origin = 'postgres:main-db')
```

* Any view within the schema using `INHERIT` will inherit this schema-level origin.
* Altering the schema later updates the default for all views.
* Resetting the setting to `NULL` downgrades all views to local-backed mode:

```sql
ALTER SCHEMA public
RESET (default_replication_origin);
```

### Summary

- `replication_origin` can be anything the application cares about, but must be prefixed with the upstream dialect
- `default_replication_origin` is the schema-level default
- `replication_origin = INHERIT` is the view-level inheritance hook

---

## Appendix B: View Updatability Criteria

A view in FlashQL is **updatable** when writes can be mapped cleanly back to an origin table. Updatability rules apply to both local and foreign-backed views.

### Core Requirements

1. **Single-origin mapping**

   * The view must derive from exactly **one origin table** for updates.
   * Joins, aggregations, or unions generally make a view read-only.

2. **Full key preservation**

   * The primary key (or a unique identifier) of the origin table must be present in the view.
   * FlashQL uses this to identify rows during updates or conflict resolution.

3. **Direct column mapping**

   * Every updatable column in the view must map 1:1 to an updatable column in the origin.
   * Computed columns or expressions break updatability.

4. **Replication awareness**

   * For foreign-backed views, the `replication_origin` must point to a writeable upstream or allow queued writes.
   * If the origin is read-only, the view itself is read-only.

### Practical Examples

```sql
-- Updatable
CREATE VIEW public.users_view AS
SELECT id, name, email
FROM public.users;

-- Not updatable (aggregates)
CREATE VIEW public.user_counts AS
SELECT country, COUNT(*) AS total
FROM public.users
GROUP BY country;
```

### Write Handling for Updatable Views

* **Runtime views:** writes propagate immediately to the origin table.
* **Materialized or realtime views:** writes are queued locally and synced to the origin asynchronously.

Updatability + replication origin together determine **whether a view can act as a write surface for federation and sync**.


## Appendix C: Replication Options

Besides `replication_origin`, FlashQL supports additional replication options.

These fall into two groups:

- **query-planning options** for federated runtime views
- **write-control options** for replicated writable views

### Query-Planning Options

These options affect how FlashQL plans federated join work:

- `join_pushdown_size`
- `join_memoization`

They are applicable only to normal runtime views.

Example:

```sql
CREATE VIEW public.posts AS
SELECT * FROM public.blog
WITH (
  replication_origin = 'postgres:db1',
  join_pushdown_size = 10,
  join_memoization = TRUE
);
```

Practical meaning:

- `join_pushdown_size`
  controls how aggressively FlashQL pushes join work toward the origin side when federated execution is possible
  
- `join_memoization`
  controls whether equivalent join work should be memoized to avoid repeating fetches

These matter for runtime federation and determine where and how reads are resolved during a join involving the upstream table.

### Write-Control Options

These options configure write behaviour for updatable, materialized or realtime views:

- `write_policy`
- `upstream_mvcc_key`

They are not applicable to normal runtime views.

Example:

```sql
CREATE MATERIALIZED VIEW public.posts AS
SELECT * FROM public.blog
WITH (
  replication_origin = 'postgres:db1',
  write_policy = 'local_first',
  upstream_mvcc_key = 'custom_v'
);
```

The important idea is:

- you write to the view
- FlashQL derives how that view maps back to the origin relation
- the view's write policy decides what local state should do before the origin acknowledges
