# Live Queries

Live queries let a SQL `SELECT` stay open and keep its result current as underlying data changes.

The API is still just `query()`, but with `live` turned on:

```js
const result = await db.query(
  'SELECT id, title FROM public.posts ORDER BY id',
  { live: true }
);
```

The returned object is a `RealtimeResult`.

## The short version

Use a live query when you want:

- a query-shaped result
- that keeps updating over time
- without rebuilding that query manually after each write

That is different from:

- [`db.stream()`](/capabilities/streaming), which is about lazy one-time iteration
- [`db.wal.subscribe()`](/capabilities/changefeeds), which is about table-level commit events

## What you get back

A live query returns a `RealtimeResult` with:

- `rows`: the current result rows
- `hashes`: internal row identity hashes
- `mode`: delivery mode such as `'live'`, `'streaming'`, or `'streaming_only'`
- `abort()`: stop the live query

Example:

```js
const result = await db.query(
  'SELECT id, title FROM public.posts ORDER BY id',
  { live: true }
);

console.log(result.rows);
console.log(result.mode);

await result.abort();
```

See also: [Query Interface](/docs/query-api#realtimeresult)

## Two ways to consume live queries

### 1. Reactive rows

The simplest form is to let `result.rows` update in place.

```js
const result = await db.query(`
  SELECT id, title
  FROM public.posts
  ORDER BY id
`, { live: true });

console.table(result.rows);

await db.query(`INSERT INTO public.posts (id, title) VALUES (3, 'New Post')`);

console.table(result.rows);
// result.rows now reflects the current query truth
```

This is the right model when your application wants the current result itself.

### 2. Commit callback

You can also receive live-query commits explicitly.

```js
const commits = [];

const result = await db.query(
  'SELECT id, name FROM public.rt_live WHERE id > 1 ORDER BY id',
  (commit) => commits.push(commit),
  { live: true }
);

console.log(result.mode);
// commonly 'streaming'

await result.abort();
```

This is useful when you want:

- the live rows
- and explicit access to diff/result commits as they happen

## What kinds of queries are supported

Live mode is currently for `SELECT` statements with a real `FROM` clause.

That means:

- plain table queries
- joins
- filters
- ordering
- limits
- aggregates
- subqueries
- derived tables

all participate in the live-query model when supported by the runtime and query shape.

## What happens when data changes

The key idea is:

> LinkedQL does not expose "table changes pretending to be query changes." It maintains the query result itself.

That means inserts, updates, deletes, join transitions, re-ordering, limit-window shifts, and aggregate recalculations are reflected as result-level changes.

### Basic row changes

Given:

```js
const result = await db.query(`
  SELECT id, title
  FROM public.posts
  ORDER BY id
`, { live: true });
```

Then:

- `INSERT` may add a row to `result.rows`
- `UPDATE` may mutate an existing row in place
- `DELETE` may remove a row from `result.rows`

### Join transitions

For joins, the effect is often subtler.

```js
const result = await db.query(`
  SELECT
    p.id,
    p.title,
    u.name AS author_name
  FROM public.posts p
  LEFT JOIN public.users u ON p.author_id = u.id
`, { live: true });
```

If a matching user row appears later, disappears later, or changes, LinkedQL tries to preserve result continuity rather than treating every join transition like a full teardown/rebuild of the row identity.

### Ordered and limited windows

Queries with `ORDER BY`, `LIMIT`, and `OFFSET` keep those semantics live.

```js
const result = await db.query(`
  SELECT *
  FROM public.posts
  ORDER BY created_at DESC
  LIMIT 5
`, { live: true });
```

This result keeps representing:

> "the newest five posts"

not:

> "the five posts that happened to be in the first render"

## Stopping a live query

Stop a live query with:

```js
await result.abort();
```

If the live query was created with a stable `id`, some runtimes also support forgetting the persisted slot state:

```js
const result = await db.query(
  'SELECT * FROM public.posts ORDER BY id',
  { live: true, id: 'posts_slot' }
);

await result.abort({ forget: true });
```

## Important constraints

### No live queries inside explicit transactions

Live queries are not supported inside explicit transactions.

### Live queries are query-level, not table-level

If you care about table mutation events directly, use:

- [Changefeeds (WAL)](/capabilities/changefeeds)

not live queries.

### Mainstream databases may need setup

On runtimes backed by mainstream databases, realtime support depends on the underlying changefeed/WAL setup described in [Dialects & Clients](/docs/setup).

## Which mode should you use?

Use a live query when:

- the UI is driven by a query result
- you want the current result kept correct over time
- joins, limits, or aggregates matter at the result level

Use `wal.subscribe()` when:

- you care about table commits directly
- you want to build your own projection logic
- you need raw mutation visibility

Use `stream()` when:

- you want lazy one-time iteration over a large result

## Reader's map

- [Query Interface](/docs/query-api)
- [Changefeeds (WAL)](/capabilities/changefeeds)
- [Streaming](/capabilities/streaming)
- [The Realtime Engine](/engineering/realtime-engine)
