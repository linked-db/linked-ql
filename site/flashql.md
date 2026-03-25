# FlashQL

*A full SQL runtime for the local process, the browser, the edge, and the offline world.*

FlashQL is LinkedQL's embeddable database engine: a complete in-process SQL runtime that runs anywhere JavaScript does, including Node.js, the browser, workers, and edge runtimes.

FlashQL brings together:

- SQL parsing and execution
- transactional local storage
- live queries
- WAL and changefeed access
- federation over foreign data
- local materialization and realtime mirroring
- point-in-time boot through version-aware replay

## Why FlashQL exists

Modern applications increasingly need database power in places where a traditional database server is inconvenient, expensive, unavailable, or simply the wrong abstraction.

Sometimes you want:

- a real query engine inside the app itself
- a local store that survives network loss
- one relational graph that spans local and remote data
- reactivity over query results, not just table events
- the ability to materialize or keep remote relations hot locally

Just spin up an instance in-app and run SQL:

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

const result = await db.query('SELECT 2::text AS value');
console.log(result.rows);
// [{ value: '2' }]

await db.disconnect();
```

This is the smallest useful FlashQL shape:

- create the client
- connect it
- run SQL
- disconnect it

## What FlashQL is good at

FlashQL is especially strong when you need one or more of these:

- a SQL runtime embedded inside an app, worker, or edge process
- a persistent local-first data layer
- live queries over local state
- one query space spanning local and remote relations
- explicit control over federation, materialization, and realtime mirroring
- point-in-time boot and version-bound execution

## Persistence

FlashQL is ephemeral by default, but it becomes a persistent local runtime when you attach a `keyval` backend.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { IndexedDBKV } from '@webqit/keyval/indexeddb';

const db = new FlashQL({
  keyval: new IndexedDBKV({ path: ['my-app'] }),
});

await db.connect();
```

With a `keyval` backend:

- schema and data can survive reloads
- WAL history can be persisted
- sync state can be persisted
- FlashQL becomes appropriate for browser PWAs and local-first applications

Without a persistence backend, the engine is still useful for tests, ephemeral sessions, and in-process computation, but the state disappears when the process ends.

## Dialects

FlashQL supports both PostgreSQL-flavored and MySQL-flavored SQL.

Set a default dialect at the client level:

```js
const db = new FlashQL({ dialect: 'postgres' });
```

Optionally override it per query:

```js
await db.query('SELECT `name` FROM `users`', { dialect: 'mysql' });
```

Where not specified, FlashQL defaults to `postgres`.

## Compatibility in practice

FlashQL speaks real SQL, but it is not trying to be a byte-for-byte clone of PostgreSQL or MySQL.

The goal is to cover the application-facing surface of SQL that actually matters in code:

- queries
- mutations
- schema operations
- expressions
- relational composition

It also adds LinkedQL-specific capabilities such as DeepRefs, version binding, and structured JSON-style language features.

See the [FlashQL Language Reference](/flashql/lang) for the current documented surface.

Two advanced PostgreSQL-flavored examples give a sense of scope:

---

<details><summary>Query 1: writable CTEs, LATERAL joins, aggregates, and windows</summary>

```js
const { rows } = await db.query(
  `WITH

      updated AS (
        UPDATE users
        SET status = 'inactive'
        WHERE last_login < NOW() - INTERVAL '90 days'
        RETURNING id, name, department, last_login
      ),

      metrics AS (
        SELECT
          u.id,
          u.name,
          u.department,
          m.avg_total,
          m.order_rank
        FROM updated u
        LEFT JOIN LATERAL (
          SELECT
            AVG(total) AS avg_total,
            RANK() OVER (ORDER BY SUM(total) DESC) AS order_rank
          FROM orders o
          WHERE o.user_id = u.id
          GROUP BY o.user_id
        ) m ON TRUE
      ),

      aggregates AS (
        SELECT
          department,
          COUNT(*) AS user_count,
          ROUND(AVG(avg_total), 2) AS avg_order_total,
          GROUPING(department) AS dept_grouped
        FROM metrics
        GROUP BY CUBE (department)
      )

    SELECT
      a.department,
      a.user_count,
      a.avg_order_total,
      SUM(a.user_count) OVER () AS total_users,
      RANK() OVER (ORDER BY a.avg_order_total DESC NULLS LAST) AS perf_rank
    FROM aggregates a
    ORDER BY a.department NULLS LAST`
);

console.log(rows);
```

</details>

Capabilities demonstrated:

- `WITH` and writable CTEs
- `UPDATE ... RETURNING`
- `JOIN LATERAL`
- aggregate and window functions
- analytic grouping such as `CUBE` and `GROUPING()`

Cause and effect in this query:

- a writable CTE mutates and returns rows
- a lateral join derives per-row metrics from that result
- the final query computes aggregate and ranking outputs from the transformed relation

---

<details><summary>Query 2: VALUES, ROWS FROM, grouping sets, and set operations</summary>

```js
const { rows } = await db.query(
  `WITH
      recent_logins AS (
        SELECT *
        FROM (VALUES
          (1, '2025-10-01'::date),
          (2, '2025-10-15'::date),
          (3, '2025-10-20'::date)
        ) AS t(user_id, last_login)
      ),

      generated AS (
        SELECT *
        FROM ROWS FROM (
          generate_series(1, 3) AS gen_id,
          unnest(ARRAY['A', 'B', 'C']) AS label
        )
      ),

      enriched AS (
        SELECT
          u.id,
          u.name,
          r.last_login,
          g.label,
          COALESCE(o.total, 0) AS total_spent
        FROM users u
        JOIN recent_logins r ON r.user_id = u.id
        JOIN generated g ON g.gen_id = u.id
        LEFT JOIN (VALUES
          (1, 1200),
          (2, 500),
          (3, 900)
        ) AS o(user_id, total) ON o.user_id = u.id
      ),

      grouped AS (
        SELECT
          label,
          DATE_TRUNC('month', last_login) AS login_month,
          COUNT(*) AS active_users,
          SUM(total_spent) AS revenue
        FROM enriched
        GROUP BY GROUPING SETS (
          (label, login_month),
          (label),
          ()
        )
      )

    SELECT * FROM grouped
    UNION ALL
    SELECT
      label,
      NULL AS login_month,
      0 AS active_users,
      0 AS revenue
    FROM generated
    EXCEPT
    SELECT
      label,
      NULL,
      0,
      0
    FROM grouped
    INTERSECT
    SELECT
      label,
      NULL,
      0,
      0
    FROM grouped
    ORDER BY label NULLS LAST`
);

console.log(rows);
```

</details>

Capabilities demonstrated:

- inline `VALUES` tables
- `ROWS FROM` and set-returning functions
- grouping sets
- combined set operations
- ordering with `NULLS LAST`

These examples show the shape of SQL FlashQL can execute.

They show that FlashQL is meant for real relational composition, not only toy queries.

## The common query surface

FlashQL supports the same top-level application contract as the other LinkedQL clients:

- `db.query()`
- `db.stream()`
- `db.transaction()`
- `db.wal.subscribe()`

And then adds local-engine-specific capabilities such as:

- `db.storageEngine`
- `db.sync.sync()`
- `versionStop`
- `overwriteForward`

## Live queries, streams, and WAL

FlashQL also supports modern application data flows directly.

### Live queries

```js
const result = await db.query(
  'SELECT id, name FROM public.users ORDER BY id',
  { live: true }
);

console.log(result.rows);
// current rows; the array keeps tracking the query as local state changes

await result.abort();
```

Use live queries when the application wants the query result itself to remain current over time.

See: [Live Queries](/capabilities/live-queries)

### Streaming

```js
for await (const row of await db.stream('SELECT * FROM public.big_table ORDER BY id')) {
  console.log(row);
}
```

This lets you consume large results lazily instead of buffering the full result in memory first.

Use streams when you want lazy one-time iteration instead of a fully buffered result set.

See: [Streaming](/capabilities/streaming)

### WAL subscriptions

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => console.log(commit)
);

await unsubscribe();
```

This observes table commits directly instead of maintaining a query-shaped live view.

Use WAL subscriptions when you care about table-level commit events directly.

See: [Changefeeds](/capabilities/changefeeds)

## Transactions and MVCC

FlashQL is transaction-first. It exposes both a SQL-facing query surface and a lower-level storage transaction surface.

```js
await db.transaction(async (tx) => {
  await db.query(
    `INSERT INTO public.users (id, name)
    VALUES (1, 'Ada')`,
    { tx }
  );
});
```

This uses the SQL-facing query surface inside a transaction.

```js
await db.transaction(async (tx) => {
  const table = tx.getTable({ namespace: 'public', name: 'users' });
  await table.insert({ id: 1, name: 'Ada' });
});
```

This uses the lower-level storage transaction surface directly.

Internally, FlashQL's storage engine uses versioned transactional state and WAL replay to support:

- isolated transactional work
- live-query invalidation and diffing
- version-aware replay to earlier points in history

This is not incidental implementation detail. MVCC is part of why FlashQL can do several important things at once without collapsing them into one coarse state model:

- transactions can work against isolated versions instead of mutating shared state in place
- readers and writers can preserve coherent visibility boundaries
- live queries can diff and advance from versioned state transitions
- persisted history can be replayed to earlier points in time

In practical terms, MVCC is what lets FlashQL be both a transactional local database and a realtime engine, rather than forcing one of those concerns to weaken the other.

## Foreign data and local-first orchestration

One of FlashQL's defining ideas is that local and remote data can belong to one query space.

FlashQL can attach foreign clients, register foreign namespaces, and expose upstream data locally through views that behave in one of three ways:

- `origin`: federated at read time
- `materialized`: copied locally on sync
- `realtime`: copied locally and kept hot after sync

Those concepts are covered in detail in:

- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
- [FlashQL Sync](/flashql/sync)

## Point-in-time boot

FlashQL can boot itself to a point in history – the state of the database at a certain table name and version.

### Read-only historical boot

```js
const historical = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
});

await historical.connect();
```

With `versionStop`, FlashQL replays itself to the time when the database had the specified table at the specified version.

The effect is that the runtime boots against that historical boundary instead of replaying all the way forward to the latest state.

By default, that boot is read-only. Rewriting the hostory from that point forward is possible with an explicit opt-in:

#### `overwriteForward: true`

```js
const branch = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
  overwriteForward: true,
});

await branch.connect();
```

With `overwriteForward: true`, FlashQL keeps the history intact until the first mutating commit, then truncates forward history and lets you continue from that historical point.

That turns the historical boot into a branch point: read-only until the first write, then writable from that point forward.

See also:

- [Version Binding](/capabilities/version-binding)
- [FlashQL Language Reference](/flashql/lang)

## What FlashQL does not try to be

FlashQL is ambitious, but it is still useful to say what it is not trying to do.

- It is not a byte-for-byte clone of PostgreSQL or MySQL.
- It does not claim universal parity with every DDL and operational feature of mainstream servers.
- Some schema-evolution surfaces are still catching up.

The goal is application-level SQL power in places where an embeddable runtime is the right tool.

## Where to go next

- [FlashQL Language Reference](/flashql/lang)
- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
- [FlashQL Sync](/flashql/sync)
- [Query Interface](/docs/query-api)
