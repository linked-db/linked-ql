# Realtime Capabilities

LinkedQL brings reactivity to the database layer, letting the database directly drive application state.

---

## Meet Live Queries

LinkedQL brings live queries to your database: PostgreSQL, FlashQL, MySQL/MariaDB*.

With just a mode switch `{ live: true }`, you get back a live, self-updating result set.

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

`result` is the same shape as a regular query result but self-updating as the database changes over time.

No need for a separate subscription layer (like a GraphQL server) in front of your database. **The query is the subscription.**

---

## Meet Changefeeds

Subscribe directly to table-level changes – `INSERT`, `UPDATE`, `DELETE`.

```js
const sub = await db.wal.subscribe({ public: ['users'] }, (commit) => {
  console.log(commit);
});
```

`db.wal.subscribe()` exposes commit-level events from the database’s change stream.

It's especially useful for replication flows, synchronization logic, and application level reactivity.

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
| **Changefeeds**   | Direct table-level commit stream                            | [Changefeeds](/realtime/changefeeds) |
