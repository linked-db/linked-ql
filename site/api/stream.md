# `db.stream()`

Streaming is LinkedQL's lazy, pull-based result consumption model. Rows are produced only as the consumer requests them via `for await`, rather than being pushed all at once.

Use it when you want:

- row-by-row async iteration
- lower peak memory usage for large result sets
- a query result you can consume on demand instead of buffering all at once

---

## API

The surface area is intentionally small:

```js
await db.stream(query, options?)
```

Supported parameters:

- `query`: the query input accepted by the current client, most commonly a SQL string
- `options.values`: positional bind values as with `db.query()`
- `options.batchSize`: number of rows fetched into memory per batch

Example:

```js
const q = 'SELECT id, email FROM public.users WHERE active = $1 ORDER BY id';
const asyncIterable = await db.stream(q, {
  values: [true],
  batchSize: 500,
});
```

What this does:

- executes the query once
- exposes the result as an async iterable, consumed incrementally

Rows are yielded in the order defined by the query.

---

## What Streaming Is and Is Not

Streaming is:

- lazy
- async-iterable
- still a single query execution

Streaming is not:

- a live query
- a changefeed
- a continuous stream over time

If you need those, see:

- [Live Queries](/realtime/live-queries)
- [Changefeeds](/realtime/changefeeds)

---

## Why `stream()`

Buffered queries are convenient:

```js
const result = await db.query('SELECT * FROM public.huge_table');
console.log(result.rows.length);
```

But for large results, buffering every row before your code can start consuming them is not always what you want.

Streaming gives you the right trade there:

- less up-front materialization
- earlier consumption
- simpler handling of large result sets

Streaming does not change query semantics. It only changes how results are consumed.

---

## Runtime Notes

### Mainstream DB Clients

For `PGClient`, `MySQLClient`, and `MariaDBClient`, `stream()` maps to the underlying client/runtime's streaming path.

### EdgeClient

`EdgeClient` can stream over:

- HTTP
- worker ports

Depending on the `portBasedStreaming` setting, rows may arrive:

- over a message port
- as a streamed HTTP body parsed incrementally

By default, `EdgeClient`'s `options.portBasedStreaming` is set to `true`, so rows are streamed over a port even on an HTTP transport. This requires the backend to expose a port-based channel. See the [Edge guide](/guides/edge).

To stream over native HTTP responses, explicitly set `options.portBasedStreaming` to `false` on `EdgeClient`:

```js
const db = new EdgeClient({
  type: 'http',
  url: '/api/db',
  portBasedStreaming: false,
});
```

Regardless of the `options.portBasedStreaming` setting, the application-facing shape remains the same: async iterable.

### FlashQL

In FlashQL, `stream()` gives you lazy iteration over the result of a local query execution.

That makes it useful for:

- local analytical scans
- browser/worker exports
- large local result sets where full buffering is unnecessary

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the related `query()` API | [Query API](/api/query) |
| streaming within a transaction | [Transaction API](/api/transaction) |
