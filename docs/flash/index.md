---
title: "FlashQL"
description: "LinkedQL’s embedded SQL engine — a full in-memory database runtime for local or offline use."
permalink: /flash/
nav_order: 2
layout: page
---

# 💾 FlashQL

*A full SQL engine for the client, the edge, and the offline world.*

FlashQL is LinkedQL’s embeddable database engine — a complete in-memory SQL runtime that runs anywhere JavaScript does: Node.js, browser, worker, or edge.

FlashQL can replace SQLite or PGLite across local-first, offline-first, and hybrid use cases — offering standard SQL semantics combined with LinkedQL’s extended language capabilities, and native support for federation and synchronization.

Use FlashQL to:

* Run full SQL queries over arbitrary datasets — even runtime data.
* Run *Live Queries* for analytics dashboards, collaborative applications, live feeds, etc.
* Federate across local and remote databases.
* Materialize datasets for offline access.
* Synchronize bidirectionally with arbitrary remote sources.

## Table of Contents

<details open><summary>Show</summary>

- [Overview](#overview)
- [` 1 |` Language Capabilities](#-1--language-capabilities)
    - [`1.1 |` Dialect Support](#11--dialect-support)
    - [`1.2 |` Syntax Coverage](#12--syntax-coverage)
        - [`1.2.1` DQL (Querying)](#121-dql-querying)
        - [`1.2.2` DML (Modification)](#122-dml-modification)
        - [`1.2.3` DDL (Definition)](#123-ddl-definition)
        - [`1.2.4` ExpL (Expressions)](#124-expl-expressions)
    - [`1.3 |` LinkedQL Language Core](#13--linkedql-language-core)
- [` 2 |` Runtime Capabilities](#-2--runtime-capabilities)
    - [`2.1 |` LinkedQL Runtime Core](#21--linkedql-runtime-core)
    - [`2.2 |` Data Orchestration & Mirroring](#22--data-orchestration--mirroring)
        - [`2.2.1` Query Federation](#221-query-federation)
        - [`2.2.2` Data Materialization](#222-data-materialization)
        - [`2.2.3` Data Sync](#223-data-sync)
- [` 3 |` Storage Backends](#-3--storage-backends)
- [` 4 |` Configuration & Extensibility](#-4--configuration--extensibility)
- [Appendix A — Quick Capability Reference](#appendix-a--quick-capability-reference)
- [Appendix B — Syntax & Compatibility](#appendix-b--syntax--compatibility)

</details>

## Overview

Modern applications need database power without the overhead of a physical database server or a network layer. Sometimes, they want both — a hybrid model that pairs traditional databases with a local engine. FlashQL addresses just that **in less than `80KiB min|zip`**.

Just spin up an instance in-app and run SQL:

```js
import { FlashClient } from '@linked-db/linked-ql/flash';

const db = new FlashClient();
await db.connect();

const result = await db.query('SELECT 2::text AS value');
console.log(result.rows); // [{ value: '2' }]

await db.disconnect();
```

Its core capabilities fall into three domains:

| Capability                | Description                                                                    |
| :------------------------ | :----------------------------------------------------------------------------- |
| **Language Capabilities** | Dual SQL dialects (Postgres/MySQL) with full LinkedQL language features        |
| **Runtime Capabilities**  | Reactivity, Data Orchestration & Mirroring (Federation, Materialization, Sync) |
| **Storage Options**       | In-memory by default, with optional persistent adapters                        |

---

## ` 1 |` Language Capabilities

FlashQL speaks real SQL — in native dialects, and with considerable syntax depth. It avoids the overhead of implementing the full PostgreSQL or MySQL systems without inhibiting expressive freedom. It in fact expands the scope of what's possible by incorporating LinkedQL's advanced language features.

This section shows what the language layer can do and how it behaves across Postgres and MySQL modes.

### `1.1 |` Dialect Support

FlashQL supports both **PostgreSQL** and **MySQL** dialects. Where not specified, FlashQL's dialect defaults to `postgres`.

Set globally:

```js
const db = new FlashClient({ dialect: 'postgres' });
```

Optionally specify per query:

```js
await db.query('SELECT `name` FROM `users`', { dialect: 'mysql' });
```

### `1.2 |` Syntax Coverage

FlashQL supports the standard query language surface (SELECTs, JOINs, aggregates), data manipulation language (INSERT/UPDATE/DELETE/UPSERT), data definition language (CREATE/ALTER/DROP), expressions (CASE, JSON operations, subqueries).

#### `1.2.1` DQL (Querying)

The `SELECT` statement with considerable syntax depth — aggregates, windows, grouping, etc., and CTEs.

```js
const { rows } = await db.query(`
  WITH recent AS (
    SELECT * FROM users WHERE last_login > NOW() - INTERVAL '30 days'
  )
  SELECT 
    u.id,
    u.name,
    COUNT(o.id) AS order_count,
    RANK() OVER (ORDER BY COUNT(o.id) DESC) AS rank
  FROM recent u
  LEFT JOIN orders o ON u.id = o.user_id
  GROUP BY u.id, u.name
  ORDER BY rank
`);

console.log('Result:', rows);
```

#### `1.2.2` DML (Modification)

The `INSERT`, `UPDATE`, `DELETE`, and `UPSERT` statements, and CTEs.

```js
// Insert new record and return generated ID
const inserted = await db.query(`
  INSERT INTO users (name, email)
  VALUES ('Ada Lovelace', 'ada@linkedql.io')
  RETURNING id
`);

// Update and inspect affected rows
const updated = await db.query(`
  UPDATE users
  SET status = 'inactive'
  WHERE last_login < NOW() - INTERVAL '90 days'
  RETURNING id, name
`);

console.log('Inserted:', inserted.rows, 'Updated:', updated.rows);
```

#### `1.2.3` DDL (Definition)

The `CREATE`, `ALTER`, `DROP` statements.

```js
await db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

await db.query(`ALTER TABLE users ADD COLUMN last_login TIMESTAMP;`);
await db.query(`DROP TABLE IF EXISTS temp_users;`);
```

#### `1.2.4` ExpL (Expressions)

The Expression Language class (ExpL) defines the full set of atomic components that resolve to a value within SQL. This is the foundation of the language core, providing comprehensive support for: scalar expressions, subqueries, functions, etc.

```js
await db.query(`
  SELECT 
    id,
    CASE WHEN jsonb_extract_path_text(profile, 'verified') = 'true'
      THEN 'verified'
      ELSE 'unverified'
    END AS status
  FROM users
`);
```

### `1.3 |` LinkedQL Language Core

FlashQL shares the same compiler and language layer as the rest of LinkedQL.

Capabilities inherited from LinkedQL includes:

| Capability            | Description                                     |   |
| :-------------------- | :---------------------------------------------- |:--|
| **DeepRefs (~>)**     | Declarative foreign-key dereferencing syntax.   | [_reference_](/linked-ql/lang/deeprefs) |
| **JSON Literals**     | Inline object and array literals.               | [_reference_](/linked-ql/lang/json-Literals) |
| **UPSERT Semantics**  | Dedicated `UPSERT` statement.                    | [_reference_](/linked-ql/lang/upsert) |
| **Versioned Queries** | Access versioned schemas using `@version`.      |   |

```sql
SELECT name, posts~>title FROM users;
```

---

## ` 2 |` Runtime Capabilities

FlashQL operates a real SQL engine that plans and evaluates queries — with good dialect fidelity. It also incorporates the same runtime core as the rest of LinkedQL, and extends that with data orchestration and mirroring capabilities.

### `2.1 |` LinkedQL Runtime Core

FlashQL shares the same runtime core as the rest of LinkedQL.

Capabilities inherited from LinkedQL includes:

| Capability            | Description                                     |   |
| :-------------------- | :---------------------------------------------- |:--|
| **Live Queries**      | LinkedQL's Live Queries capability.             | [_reference_](/linked-ql/proc/realtime-sql) |
| **Database Versioning** | LinkedQL's versioning system. |   |

### `2.2 |` Data Orchestration & Mirroring

FlashQL runs a hybrid execution model that lets local queries span remote databases or APIs — without forcing a specific replication pattern. It can query on-the-fly, materialize datasets locally, or keep them in continuous sync — all through SQL alone.

You get three modes:

+ **Federation**: join remote databases or arbitrary data sources in the same query — on demand
+ **Materialization**: pull remote datasets locally for offline-first and edge-first workloads
+ **Sync**: keep local and remote in continuous two-way sync

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │ ─────── Federation ──────────> │   Remote DB(s)   │
│                 │ <────── Materialization ────── │                  │
│     (Local)     │ <────── Sync ────────────────> │ (Postgres, etc.) │
└─────────────────┘                                └──────────────────┘
```

Each mode requires FlashQL to be initialized with a remote connection factory:

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
import { PGClient } from '@linked-db/linked-ql/pg';

const local = new FlashClient({
  onCreateRemoteClient: async (opts) => {
    const remote = new PGClient(opts);
    await remote.connect();
    return remote;
  },
});
await local.connect();
```

#### `2.2.1` Query Federation

Join remote databases or arbitrary data sources in the same query — on demand. 

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │ ─────── Federation ──────────> │   Remote DB(s)   │
│                 │         query parts run →      │                  │
│     (Local)     │         results stream ←       │ (Postgres, etc.) │
└─────────────────┘                                └──────────────────┘
```

*(a) Federate a remote dataset (or many of such)*

```js
await local.federate({ public: ['users', 'orders'] }, {
  host: 'localhost',
  port: 5432,
  database: 'production'
});
```

*(b) With filters*

```js
await local.federate(
  {
    pg1: {
      namespace: 'public',
      name: 'products',
      filters: { status: 1 }
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(c) Using SQL*

```js
await local.federate(
  {
    analytics: {
      name: 'events',
      query: `
        SELECT * FROM public.events 
        WHERE created_at > NOW() - INTERVAL '7 days'
      `
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(d) Query across all federated origins* LinkedQL automatically routes the relevant parts of your query to their respective origins and streams results back into the working dataset.

```js
const result = await local.query(`
  SELECT 
    u.id, 
    u.name,
    o.total, 
    p.name AS product_name,
    e.event_type
  FROM public.users u
  JOIN public.orders o ON u.id = o.user_id
  JOIN pg1.products p ON o.product_id = p.id
  LEFT JOIN analytics.events e ON u.id = e.user_id
  WHERE o.created_at > NOW() - INTERVAL '30 days'
  ORDER BY o.total DESC
`);

console.log(result.rows);
```

+ Federation is lazy — data is streamed on demand, not bulk-copied.
+ Perfect for large datasets that don't fit into local memory at once.

#### `2.2.2` Data Materialization

Pull remote datasets locally for offline-first and edge-first workloads.

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │                                │   Remote DB(s)   │
│                 │ <────── Materialization ────── │                  │
│     (Local)     │         pull data ←            │ (Postgres, etc.) │
└─────────────────┘         keep locally           └──────────────────┘
```

*(a) Materialize specified tables from a remote database (or many of such; executes immediately*

```js
await local.materialize({ public: ['users', 'orders'] }, {
  host: 'localhost',
  port: 5432,
  database: 'production'
});
```

*(b) With filters*

```js
await local.materialize(
  {
    pg1: {
      namespace: 'public',
      name: 'products',
      filters: { status: 1 }
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(c) Using SQL*

```js
await local.materialize(
  {
    analytics: {
      name: 'events',
      query: `
        SELECT * FROM public.events 
        WHERE created_at > NOW() - INTERVAL '7 days'
      `
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(d) Query locally — offline)*

```js
const result = await local.query(`
  SELECT 
    u.id, 
    u.name,
    o.total,
    p.name AS product_name
  FROM public.users u
  JOIN public.orders o ON u.id = o.user_id
  JOIN pg1.products p ON o.product_id = p.id
  ORDER BY o.total DESC
`);
console.log(result.rows);
```

+ Materialization executes immediately and pulls the targeted data locally.
+ Use `{ live: true }` to make it self-updating.
+ Ideal for PWAs and edge runtimes where offline continuity matters.

#### `2.2.3` Data Sync

Materialize datasets and activate two-way synchronization between local and remote datasets. Offline writes are queued and replayed; conflicts are resolved.

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │         changes ⇄              │   Remote DB(s)   │
│                 │         resolve conflicts      │                  │
│     (Local)     │ <────── Sync ────────────────> │ (Postgres, etc.) │
└─────────────────┘                                └──────────────────┘
```

*(a) Initialize and activate sync*

```js
await local.sync(
  { public: ['users', 'orders'] },
  { host: 'localhost', port: 5432, database: 'production' }
);
```

*(b) Mutate locally — changes sync automatically)*

```js
await local.query(`
  INSERT INTO users (name, email)
  VALUES ('New User', 'user@example.com')
`);

await local.query(`
  UPDATE orders
  SET status = 'completed'
  WHERE id = 123
`);
```

+ Sync combines materialization with live bidirectional updates and conflict resolution.
+ Changes queue automatically when offline and replay when connectivity returns.
+ The mode you reach for in offline-first apps and edge nodes.
+ Current stage: **alpha**.

---

## ` 3 |` Storage Backends

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

---

## ` 4 |` Configuration & Extensibility

FlashQL exposes a minimal configuration surface for adapting its behavior.

| Hook                    | Purpose                                   |
| :---------------------- | :---------------------------------------- |
| `dialect`               | Specify default dialect                   |
| `onCreateRemoteClient`  | Define how remote connections are created |
| `storage` (*planned*)   | Customize persistence layer               |
| `functions` (*planned*) | Register user-defined SQL functions       |
| `hooks` (*planned*)     | Integrate orchestration or logging        |

---

## Appendix A — Quick Capability Reference

For a quick reference to FlashQL's capabilities, here are **two master queries** designed to stress FlashQL’s parser and executor in different ways. (Note that this contains Postgres-specific syntax.)

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
* Ordering with `NULLS LAST`

## Appendix B — Syntax & Compatibility

The following summarizes FlashQL’s current feature matrix and compatibility across environments.

| Category                | Highlights                                          |
| :---------------------- | :-------------------------------------------------- |
| **Dialects**            | PostgreSQL (default), MySQL                         |
| **SQL Coverage**        | DQL, DML, DDL, ExpL, CTEs, Set Ops, JSON            |
| **LinkedQL Extensions** | DeepRefs, JSON literals, UPSERTS, Versioned queries |
| **Runtime**             | Live queries, Federation, Materialization, Sync     |
| **Persistence**         | In-Memory, IndexedDB, Custom                        |
| **Environment**         | Node.js, Browser, Worker, Edge                      |
| **Status**              | Stable (core), Alpha (sync)                         |

