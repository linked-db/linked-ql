# Changefeeds (WAL)

*Subscribe to structured table-level commits through `client.wal.subscribe(...)`.*

```js
await client.wal.subscribe({ public: ['users'] }, (commit) => {
  console.log(commit.entries);
});
```

## Status

This page is currently a stub.

It exists so the README and docs can point to a dedicated home for:

* the WAL/changefeed API
* selectors and subscription scope
* `commit.entries` shape
* when to use changefeeds versus live queries
* driver/runtime-specific notes

## For now

See these pages while this guide is being expanded:

* [Live Queries](/capabilities/live-queries)
* [Query Interface](/docs/query-api)
* [The Realtime Engine](/engineering/realtime-engine)

