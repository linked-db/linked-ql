# Realtime Capabilities

LinkedQL brings reactivity to the database layer, letting queries directly drive application state.

On any given database, LinkedQL lets you have live queries as a first-class capability, and directly supports table-level subscriptions.

---

## Meet Live Queries

```js
const result = await db.query(`
  SELECT
    p.title,
    p.category,
    author ~> { name, email } AS author
  FROM posts AS p
  WHERE p.published = true
  ORDER BY p.created_at DESC
`, { live: true });
```

No need for a separate subscription layer (like a GraphQL server) in front of your database. **Your query is the subscription.**

`result` is the same shape as a regular query result but self-updating as the database changes over time.

Updates are pushed from the database to the client—no polling, no manual subscriptions:

* automatically stays current over time
* directly powers reactivity across the app

---

## Meet Changefeeds (Direct Table-Level Subscriptions)

```js
const unsubscribe = await db.wal.subscribe({ public: ['users'] }, (commit) => {
  console.log(commit);
});
```

Sometimes you need changes at the table or commit level, not a query result.

`db.wal.subscribe()` exposes commit-level events from the database’s change stream::

* PostgreSQL's Write Ahead Log (WAL)
* MySQL/MariaDB's Binary Log (Binlog)
* FlashQL's Write Ahead Log (WAL)

It's especially useful for replication flows, synchronization logic, and downstream processors.

---

## The Broader Idea

In a traditional stack, reactivity is assembled from multiple layers:

- the database
- a subscription server and/or a sync engine
- app-level invalidation logic
- client caches or replicas

LinkedQL pushes the behaviour itself into where the data already lives: the database, collapsing that stack back into the database layer.

---

## Documentation

| Capability        | What It Adds                                                | Docs                                         |
| :---------------- | :---------------------------------------------------------- | :------------------------------------------- |
| **Live Queries**  | Queries that work in live mode and return real-time results | [Live Queries](/realtime/live-queries)           |
| **Changefeeds**   | Direct table-level commit stream                            | [JSON Literals](/realtime/changefeeds) |
