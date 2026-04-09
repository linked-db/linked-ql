# FlashQL

*A full SQL runtime for the local process, the browser, the edge, and the offline world.*

FlashQL is LinkedQL's embeddable database engine: a complete in-process SQL runtime that runs anywhere JavaScript does, including Node.js, the browser, workers, and edge runtimes.

FlashQL brings together:

- a full relational SQL engine
- live queries
- federation, materialization, and sync
- observable commit stream via a Write-Ahead Log (WAL)
- transactional local storage, with MVCC-based architecture
- point-in-time boot through version-aware replay

## Why FlashQL

Modern applications increasingly need database power in places where a traditional database server is inconvenient, expensive, unavailable, or simply the wrong abstraction.

Sometimes you want:

- a real query engine inside the app itself
- a local store that survives network loss
- one relational graph that spans local and remote data
- reactivity over query results, not just table events
- the ability to materialize or keep remote relations hot locally

Just spin up a FlashQL instance and run SQL:

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

The goal is application-level SQL power in places where an embeddable runtime is the right tool.

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

- schema and data survive reloads
- WAL history is persisted
- sync state is persisted
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

## Compatibility in Practice

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

## The Common Query Surface

FlashQL supports the same top-level application contract as the other LinkedQL clients:

- `db.query()`
- `db.query({ live: true })`
- `db.stream()`
- `db.transaction()`
- `db.wal.subscribe()`

And then extends that with:

- `db.sync.sync()`

## Live Queries, Streams, and the Commit Stream (WAL)

FlashQL supports modern application data flows directly.

### Live Queries

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

Take a deep dive in:

* [Live Queries](/capabilities/live-queries)

### Streaming

```js
for await (const row of await db.stream('SELECT * FROM public.big_table ORDER BY id')) {
  console.log(row);
}
```

This lets you consume large results lazily instead of buffering the full result in memory first.

See more in [Streaming](/capabilities/streaming)

### The Commit Stream (WAL)

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

## Transactions and the Multi-Version Concurrency Control (MVCC) Architecture

FlashQL uses **Multi-Version Concurrency Control (MVCC)**, the same core model used by PostgreSQL.

Every write creates a new version of a row, and every transaction reads from a **consistent snapshot in time**.

While you don't think about it, each query you run

```js
await db.query(
  `INSERT INTO public.users (id, name)
  VALUES (1, 'Ada');
  DELETE FROM public.orders WHERE id = 2;`
);
```

executes within a transaction. Errors are isolated to that transaction, and the entire operation is automatically rolled back on error.

Internally:

* transactions don’t overwrite rows—they produce new versions
* each transaction sees a stable view of the database
* reads and writes don’t block each other

If you’ve used PostgreSQL, this is the same idea—just running locally, in-process.

Because everything is versioned, FlashQL can layer on:

* **a row-version-aware sync engine**
* **WAL-based change streams**
* **replay and point-in-time boot**

—all without introducing a separate model for reactivity or sync.

## Federation, Materialization, and Sync

FlashQL can compute both local and remote data in **the same query**.

You simply define a table locally (a database view precisely) to mirror remote data; you decide how it behaves locally in one of three modes:

* **federated** — querying the table queries the source directly
* **materialized** — the table is a materialized copy of the source data
* **realtime** — the table materializes and stays in sync with source data

Your code sees normal tables:

```sql
SELECT *
FROM public.local_users u
JOIN public.remote_orders o ON o.user_id = u.id;
```

FlashQL computes the local + remote data as one relational graph.

What changes is what you don't get to build:

* dedicated REST APIs for reads
* caching layers for performance
* subscription systems (e.g. GraphQL) for updates
* a dedicated sync engine to synchronize local and remote states
* the orchestration layer for the whole system

FlashQL is designed as a drop-in primitive for the modern app.

Take a deep dive in:

- [Federation, Materialization, and Sync](/flashql/foreign-io)
- [The Sync API](/flashql/sync-api)

## Point-in-Time Boot

FlashQL can boot itself to a point in history – the state of the database at a certain table name and version.

### Read-Only Historical Boot

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

With `overwriteForward: true`, FlashQL keeps the history intact until the first mutating commit is made, then truncates forward histories and lets you continue from that historical point.

That turns the historical boot into a branch point: read-only until the first write, then writable from that point forward.

See also:

- [Version Binding](/capabilities/version-binding)

## Where to Go Next

- [Federation, Materialization, and Sync](/flashql/foreign-io)
- [The Sync API](/flashql/sync-api)
- [Query Interface](/docs/query-api)
- [FlashQL Language Reference](/flashql/lang)
