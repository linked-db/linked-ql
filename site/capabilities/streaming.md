# Streaming

*Iterate large result sets lazily instead of materializing everything at once.*

```js
const rows = await client.stream(`SELECT * FROM users ORDER BY id`);

for await (const row of rows) {
  console.log(row);
}
```

## Status

This page is currently a stub.

It exists so the README and docs can point to a dedicated home for:

* `client.stream()`
* lazy async iteration
* batch-oriented fetching
* when to prefer streaming over `query()`
* runtime-specific notes for PostgreSQL, FlashQL, and `EdgeClient`

## For now

See these pages while this guide is being expanded:

* [Query Interface](/docs/query-api)
* [Dialects & Clients](/docs/setup)

