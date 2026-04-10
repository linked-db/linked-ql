# Streaming

Streaming is LinkedQL's lazy, pull-based result consumption model. Here, rows are produced only as the consumer requests them (via `for await`), rather than being pushed all at once.

Use it when you want:

- row-by-row async iteration
- lower peak memory usage for large result sets
- a query result you can consume on demand instead of buffering all at once

The API is:

```js
const asyncIterable = await db.stream('SELECT * FROM public.users ORDER BY id');

for await (const row of asyncIterable) {
  console.log(row);
}
```

## API

The surface area is intentionally small:

```js
await db.stream(query, options?)
```

Supported parameters:

- `query`: the query input accepted by the current client, most commonly a SQL string
- `options.values`: positional bind values as with `db.query()`
- `options.batchSize`: number of rows fetched into memory per batch (affects internal buffering, not the one-row-at-a-time iteration interface)

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

Rows are yielded in the order defined by the query (e.g. `ORDER BY`).

## What Streaming Is and Is Not

Streaming is:

- lazy
- async-iterable
- still a single query execution

Streaming is not:

- a live query (results do not update after execution)
- a changefeed (no new rows are observed after the query completes)
- a continuous stream over time

If you need those, see:

- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)

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

Streaming does not change query semantics—it only changes how results are consumed.

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

By default, `portBasedStreaming` is set to `true` – rows are streamed over port even on a HTTP transport. This requires the backend to expose a port-based channel (see [`event.client`](/docs/setup#event-client) in `EdgeWorker`).

To stream over native HTTP responses, explicitly set `portBasedStreaming` to `false` on both `EdgeClient` and `EdgeWorker`:

```js
// On the client side
const db = new EdgeClient({
  type: 'http',
  url: '/api/db',
  portBasedStreaming: false
});
```

```js
// On the remote side
const httpWorkerEdge = EdgeWorker.httpWorker({
  db: new PGClient(),
  portBasedStreaming: false
});
```

Regardless of the `portBasedStreaming` setting, the application-facing shape remains the same async iterable.

### FlashQL

In FlashQL, `stream()` gives you lazy iteration over the result of a local query execution.

That makes it useful for:

- local analytical scans
- browser/worker exports
- large local result sets where full buffering is unnecessary

## Related Docs

- [Query Interface](/docs/query-api)
- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)
