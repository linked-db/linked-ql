# FlashQL

*A full SQL engine for the local runtime, the edge, and the offline world.*

FlashQL is LinkedQL’s embeddable database engine — a complete in-memory SQL runtime that runs anywhere JavaScript does: Node.js, browser, worker, or edge.

FlashQL can replace SQLite or PGLite across a variety of use cases — offering standard SQL semantics combined with LinkedQL’s extended capabilities, and native support for federation and synchronization.

Use FlashQL to:

* Run full SQL queries over arbitrary datasets — even runtime data.
* Run *Live Queries* for analytics dashboards, collaborative applications, live feeds, etc.
* Federate across local and remote databases.
* Materialize datasets for offline access.
* Synchronize bidirectionally with arbitrary remote sources.

## Overview

Modern applications need database power without a network layer or the overhead of a physical database server. Sometimes, they also need both — a hybrid model that pairs traditional databases with a local engine. FlashQL addresses just that **in less than `80KiB min|zip`**.

Just spin up an instance in-app and run SQL:

```js
import { FlashClient } from '@linked-db/linked-ql/flash';

const db = new FlashClient();
await db.connect();

const result = await db.query('SELECT 2::text AS value');
console.log(result.rows); // [{ value: '2' }]

await db.disconnect();
```

From here, you get a robust query engine that can query just as fine from arbtrary data sources as from the local store — a defining feature of **FlashQL**. Meet the FlashQL **Universal I/O** model.

## Dialects

FlashQL supports both **PostgreSQL** and **MySQL** dialects.

Set globally:

```js
const db = new FlashClient({ dialect: 'postgres' });
```

Optionally specify per query:

```js
await db.query('SELECT `name` FROM `users`', { dialect: 'mysql' });
```

Where not specified at any scope, FlashQL's dialect defaults to `postgres`.

## Compatibility

FlashQL speaks real SQL — in native dialects, but isn't a full clone of PostgreSQL or MySQL.
The goal isn’t to reproduce the entire database engine surface, but to cover the full scope of application-level SQL — streamlined to the declarative and structural features actually used in code: queries, mutations, definitions, and expressions.

You'd find FlashQL's implementation coverage of SQL in the [Language Reference](/flashql/lang). (Treat as a live reference.)

To give a **general** sense of FlashQL’s SQL feature coverage, here are two advanced example queries using PostgreSQL-specific syntax.

---

<details><summary>Query 1: (click to show)</summary>

```js
const { rows } = await db.query(
    `WITH

        -- 1️⃣  Writable CTE: mutate + return
        updated AS (
            UPDATE users
            SET status = 'inactive'
            WHERE last_login < NOW() - INTERVAL '90 days'
            RETURNING id, name, department, last_login
        ),

        -- 2️⃣  Derived metrics using LATERAL subquery
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

        -- 3️⃣  Aggregate by department with ROLLUP + CUBE
        aggregates AS (
            SELECT 
            department,
            COUNT(*) AS user_count,
            ROUND(AVG(avg_total),2) AS avg_order_total,
            GROUPING(department) AS dept_grouped
            FROM metrics
            GROUP BY CUBE (department)
        )

    -- 4️⃣  Combine results and compute analytics
    SELECT 
    a.department,
    a.user_count,
    a.avg_order_total,
    SUM(a.user_count) OVER () AS total_users,
    RANK() OVER (ORDER BY a.avg_order_total DESC NULLS LAST) AS perf_rank
    FROM aggregates a
    ORDER BY a.department NULLS LAST`
);

console.log('Result:', rows);
```

</details>

Capabilities demonstrated:

+ CTEs (`WITH`)
+ writable CTE (`UPDATE…RETURNING`)
+ `JOIN LATERAL`
+ aggregate and window functions (`AVG`, `RANK`, `SUM OVER()`)
+ analytic grouping (`CUBE`, `GROUPING()`)
+ expression logic

---

<details><summary>Query 2: (click to show)</summary>

```js
const { rows } = await db.query(
    `WITH
        --  Inline VALUES table
        recent_logins AS (
            SELECT *
            FROM (VALUES
            (1, '2025-10-01'::date),
            (2, '2025-10-15'::date),
            (3, '2025-10-20'::date)
            ) AS t(user_id, last_login)
        ),

        -- 2️⃣  Combine multiple function outputs with ROWS FROM
        generated AS (
            SELECT *
            FROM ROWS FROM (
            generate_series(1, 3) AS gen_id,
            unnest(ARRAY['A', 'B', 'C']) AS label
            )
        ),

        -- 3️⃣  Join VALUES + ROWS FROM + base table
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

        -- 4️⃣  Aggregate and group with GROUPING SETS
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

    -- 5️⃣  Combine with another set using UNION / INTERSECT / EXCEPT
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

console.log('Result:', rows);
```

</details>

Capabilities demonstrated:

* Inline `VALUES` tables
* `ROWS FROM` with multiple functions
* Combined `JOIN`s on derived tables
* `COALESCE` and `DATE_TRUNC` expressions
* `GROUPING SETS` multi-level aggregation
* Chained set operations (`UNION ALL … EXCEPT … INTERSECT`)
* Set Returning Functions (SRF) `UNNEST()`, `GENERATE_SERIES()`
* Ordering with `NULLS LAST`

## Storage Backends

FlashQL’s in-memory engine is volatile by default. To persist or share state, plug in an alternate backend.

* **In-Memory (default)** — ephemeral, ultra-fast.
* **IndexedDB (browser, planned)** — persistent storage for the web.
* **Redis (planned)** — shared network memory.
* **Custom (planned)** — plug-in adapter.

```js
const db = new FlashClient({
  storage: new MyAdapter({
    onLoad: async () => { /* load from disk */ },
    onFlush: async (data) => { /* write to disk */ },
  }),
});
```

## LinkedQL Capabilities

FlashQL shares the same core as the rest of LinkedQL, bringing its advanced language and runtime capabilities to the local runtime. This core includes:

| Language Capabilities                                     | Runtime Capabilities                                     |
| :-------------------------------------------------------- | :------------------------------------------------------- |
| **[DeepRefs](/capabilities/deeprefs)**               | **[Live Queries](/capabilities/live-queries)**      |
| **[JSON Literals](/capabilities/json-literals)**     |                                                          |
| **[UPSERT](/capabilities/upsert)**                   |                                                          |

```js
const result = await client.query(`
    SELECT title, author ~> name FROM posts
`, { live: true }
);
```

## Universal I/O

Beyond just a local database, FlashQL is built as a **unified SQL interface** over your entire data universe — wherever that may span. The query engine follows a model that lets you bring **arbitrary data** into a single relational query space — whether from the local runtime, a remote database, a REST API, or any other source. Your application sees a unified abstraction — a query space — while the specific details of these sources remain isolated to the wiring layer.

FlashQL exposes these capabilities through **Foreign I/O** — a family of interfaces that let you:

* **Federate** — write queries that span multiple data origins on the fly.
* **Materialize** — stage remote data locally for edge or offline execution.
* **Synchronize** — maintain bidirectional sync between local and remote states.

These are covered in the [Foreign I/O](flashql/foreign-io) reference.

## Configuration & Extensibility

FlashQL exposes a minimal configuration surface for adapting its behavior.

| Hook                    | Purpose                                   |
| :---------------------- | :---------------------------------------- |
| `dialect`               | Specify default dialect                   |
| `onCreateRemoteClient`  | Define how remote connections are created |
| `storage` (*planned*)   | Customize persistence layer               |
| `functions` (*planned*) | Register user-defined SQL functions       |
| `hooks` (*planned*)     | Integrate orchestration or logging        |
