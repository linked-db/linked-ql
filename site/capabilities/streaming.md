# Streaming

Streaming is LinkedQL's lazy, pull-based result consumption model.

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

## What streaming is and is not

Streaming is:

- lazy
- async-iterable
- still a single query execution

Streaming is not:

- a live query
- a table-level changefeed
- "rows as they change over time"

If you need those, see:

- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)

## Why `stream()` exists

Buffered queries are convenient:

```js
const result = await db.query('SELECT * FROM public.huge_table');
console.log(result.rows.length);
```

But buffering every row before your code can start consuming them is not always what you want.

Streaming gives you the right trade there:

- less up-front materialization
- earlier consumption
- simpler handling of large result sets

## Basic example

```js
const rows = await db.stream(`
  SELECT id, email
  FROM public.users
  ORDER BY id
`);

for await (const row of rows) {
  console.log(row.id, row.email);
}
```

What this does:

- runs the query once
- returns an async iterable
- yields one row at a time to your loop

## Example: processing a large export

```js
const rows = await db.stream(`
  SELECT id, created_at, total
  FROM public.orders
  ORDER BY id
`);

for await (const row of rows) {
  await writeRowToExport(row);
}
```

This is a better fit than `query()` when the output could be large and you want to process rows incrementally.

## Streaming inside a transaction

`stream()` can participate in explicit transactions.

### Example with `EdgeClient`

```js
await edge.transaction(async (tx) => {
  const rows = await edge.stream(`
    SELECT id, name
    FROM public.users
    ORDER BY id
  `, { tx });

  for await (const row of rows) {
    console.log(row);
  }
});
```

The same idea applies across runtimes:

- open a transaction
- pass `tx`
- consume rows lazily

## Runtime notes

### Mainstream DB clients

For `PGClient`, `MySQLClient`, and `MariaDBClient`, streaming maps to the underlying client/runtime's stream-capable path.

### EdgeClient

`EdgeClient` can stream over:

- HTTP
- worker ports

Depending on transport settings, rows may arrive:

- over a message port
- as a streamed HTTP body such as NDJSON

The application-facing shape is still the same async iterable.

### FlashQL

In FlashQL, `stream()` gives you lazy iteration over the local engine's query result.

That makes it useful for:

- local analytical scans
- browser/worker exports
- large local result sets where full buffering is unnecessary

## Related docs

- [Query Interface](/docs/query-api)
- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)
