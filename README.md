<div align="center">
    
# LinkedQL

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

_A modern take on SQL and SQL databases_

</div>

<picture>
  <source media="(max-width: 799px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-mobile2.png?raw=true">
  <source media="(min-width: 800px)" srcset="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true">
  <img src="https://github.com/linked-db/linked-ql/blob/next/resources/linked-ql-main2.png?raw=true" alt="LinkedQL Banner" width="100%">
</picture>

<div align="center">

<!--
[⤷ Follow](https://x.com/LinkedQL) • [💖 Sponsor](https://github.com/sponsors/ox-harris)
-->

> ```bash
> npm install @linked-db/linked-ql@next
> ```

LinkedQL is one unified abstraction for your entire database universe — with all the boxes checked for modern apps:

</div>


<div align="center">

|  |  |
|:---|:---|
| **⚡ Quick-Start** | (_basic guide_) |
| **🏗️ Design** | [Dialects & Clients](#-1--dialects--clients) • [Query Interface](#-2--query-interface) |
| **🚀 Capabilities** | [Language Capabilities](#-1--language-capabilities) • [Runtime Capabilities](#-2--runtime-capabilities) |
| **💾 FlashQL** | [Usage](#-1--usage) • [Data Orchestration](#-2--data-orchestration) |

</div>

---

## ⚡ Quick-Start

⤷ _Install and use as a regular database client:_

```shell
npm i @linked-db/linked-ql@next
```

```js
// Import from the relevant namespace
import { PGClient } from '@linked-db/linked-ql/pg';

// Initialize and connect
const client = new PGClient({ 
  host: 'localhost', 
  port: 5432,
  database: 'myapp',
  user: 'postgres',
  password: 'password'
});

await client.connect();

// Run queries
const result = await client.query(`SELECT 10 as value`);
console.log(result.rows); // [{ value: 10 }]

// Don't forget to close the connection
await client.disconnect();
```

> [!IMPORTANT]  
> You're viewing **@linked-db/linked-ql@next** — the upcoming iteration.  
> See [@linked-db/linked-ql@0.3.*](https://github.com/linked-db/linked-ql) for the current version (being also the version covered in the [docs](https://github.com/linked-db/linked-ql/wiki)).

---

## 🏗️ Design

LinkedQL is designed as a classic database query client — `client.query()` — but this time, one that _keeps the looks_ but _changes the scope_ to meet the new definition of modern database abstraction. This means, _not trading_ the simplicity of an ordinary query client, and yet expanding in capability to support modern apps.

LinkedQL speaks two dialects: PostgreSQL and MySQL — supporting any PostgreSQL, or MySQL/MariaDB database backend. It additionally ships as a complete embeddable database engine — FlashQL (detailed just ahead) — which runs essentially anywhere JavaScript runs: client, server, edge.

The result is a single data interface for a wide range of application types and deployment models: traditional server-side applications, client-side apps/PWAs, microservices, edge computing, offline-first apps, and real-time collaborative apps.

<div>

### ⤷ _Overview_

|  |  |
|:---|:---|
| **Dialects & Clients** | [PostgreSQL](#11--postgresql) • [MySQL](#12--mysql) • [MariaDB](#13--mariadb) • [FlashQL](#14--flashql) |
| **Query Interface** | [client.query()](#21--clientquery) • [Result](#22--result) |

</div>

### ` 1 |` Dialects & Clients

Below are the corresponding clients for the supported dialects. The PostgreSQL, MySQL, and MariaDB clients are each an extension of their respective native connector; each accepting the same *init* options as those.

FlashQL is a standalone SQL engine and speaks both dialects.

#### `1.1 |` PostgreSQL

Use as a drop-in replacement for [`node-postgres`](https://www.npmjs.com/package/pg).<br>
(Speaks native `PostgreSQL`)

```js
// Import from the "pg" namespace
import { PGClient } from '@linked-db/linked-ql/pg';

// Initialize and connect
const client = new PGClient({
  // Same init options as node-postgres's
  host: 'localhost', 
  port: 5432,
  // Whether to run on: pg.Pool or pg.Client
  poolMode: true | false, // default: false, pg.Client
});
await client.connect();
```

```js
// Run postgres-specific query
const res = await client.query('SELECT 1::text AS result');
console.log(res.rows); // [{ result: '1' }]
```

```js
// Close connections and free resources
await client.disconnect();
```

#### `1.2 |` MySQL

Use in place of [`mysql2`](https://www.npmjs.com/package/mysql2).<br>
(Speaks native `MySQL`)

```js
// Import from the "mysql" namespace
import { MySQLClient } from '@linked-db/linked-ql/mysql';

// Initialize and connect
const client = new MySQLClient({
  // Same init options as mysql2's
  host: 'localhost', 
  port: 3306,
  // Whether to run on: mysql.createPool() or mysql.createConnection()
  poolMode: true | false, // default: false, mysql.createConnection()
});
await client.connect();
```

```js
// Run mysql-specific query
const res = await client.query('SELECT 1 AS `result`');
console.log(res.rows); // [{ result: 1 }]
```

```js
// Close connections and free resources
await client.disconnect();
```

#### `1.3 |` MariaDB

Use in place of [`mariadb`](https://www.npmjs.com/package/mariadb).<br>
(Speaks native `MySQL/MariaDB`)

```js
// Import from the "mariadb" namespace
import { MariaDBClient } from '@linked-db/linked-ql/mariadb';

// Initialize and connect
const client = new MariaDBClient({
  // Same init options as mariadb's
  // always runs on mariadb.createPool()
  host: 'localhost', 
  port: 3306,
});
await client.connect();
```

```js
// Run mysql-specific query
const res = await client.query('SELECT 1 AS `result`');
console.log(res.rows); // [{ result: 1 }]
```

```js
// Close connections and free resources
await client.disconnect();
```

#### `1.4 |` FlashQL

Use in place of [`SQLite`](https://sqlite.org/)/[`PGLite`](https://pglite.dev/).<br>
(Speaks both `PostgreSQL` and `MySQL`)

```js
// Import from the "flash" namespace
import { FlashClient } from '@linked-db/linked-ql/flash';

// Initialize and connect
const client = new FlashClient();
await client.connect();
```

```js
// Run postgres-specific query - by default: { dialect: 'postgres' }
const res = await client.query('SELECT 1::text AS result');
console.log(res.rows); // [{ result: '1' }]

// Run mysql-specific query - using { dialect: 'mysql' }
const res = await client.query('SELECT 1 AS `result`', { dialect: 'mysql' });
console.log(res.rows); // [{ result: 1 }]
```

```js
// Free resources
await client.disconnect();
```

### ` 2 |` Query Interface

LinkedQL offers a **unified** query interface across all dialects and clients.

#### `2.1 |` `client.query()`

The primary query API.<br>
(Supports multiple input shapes for flexibility.)

```js
// String query only
const result = await client.query('SELECT * FROM users');

// Query with parameters array
const result = await client.query('SELECT * FROM users WHERE active = $1', [true]);
```

```js
// Query with parameters and options
const result = await client.query(
  'SELECT * FROM users WHERE created_at > $1',
  [new Date('2024-01-01')],
  { live: true }
);

// Query with parameters via options.values
const result = await client.query('SELECT * FROM users WHERE name = $1', { values: ['John'], /* other options*/ });
```

#### `2.2 |` `Result`

The `result` object.<br>
(Exposes `.rows`, `.rowCount` (alias `.affectedRows`))

```js
// result.rows
const result = await client.query('SELECT id, name, email FROM users');
console.log(result.rows);     // [{ id: 1, name: 'John', email: 'john@example.com' }]

console.log(result.rowCount); // 0 (Not applicable to this kind of query)
```

```js
// result.rows
const result = await client.query('INSERT INTO users (name) VALUES ($1) RETURNING *', ['Alice']);
console.log(result.rows);     // [{ id: 2, name: 'Alice', email: null }]

console.log(result.rowCount); // 0 (Not applicable to this kind of query)
```
```js
// result.rowCount
const result = await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
console.log(result.rowCount); // 1 

console.log(result.rows);     // [] (Not applicable to this kind of query)
```

---

## 🚀 Capabilities

The most exciting part of LinkedQL is its language and runtime capabilities — where it stops being an ordinary query client and becomes a modern take on SQL and SQL databases.

At the language level, you get an advanced form of SQL that lets you do far more within your queries than was previously possible even with additional tooling. It comes not just as a more powerful query language, but also a more declarative one — saving you months of wrangling with SQL and ORMs.

At the runtime level, LinkedQL extends your database with a new query execution model: reactivity, and a new versioning model: automatic versioning, and semantic version control. These new capabilities mark a shift in how we think about database interactions.

The result is a smarter, more powerful database abstraction layer for modern apps that collapses layers of ORMs, query builders, migration tools, complex data architectures, and GraphQL servers.

<div>

### ⤷ _Overview_

|  |  |
|:---|:---|
| **Language Capabilities** | [DeepRefs](#11--deeprefs) • [JSON Shorthands](#12--json-shorthands) • [UPSERT Statement](#13--the-upsert-statement) |
| **Runtime Capabilities** | [Live Queries](#21--live-queries) • [Realtime Triggers](#22--realtime-triggers) <br>• [Automatic Versioning](#23--automatic-database-versioning-coming-soon) • [Semantic Version Binding](#24--semantic-version-binding-coming-soon) |

</div>

### ` 1 |` Language Capabilities

Eliminate tons of boilerplate and external tooling with LinkedQL's set of syntax shorthands. Here, LinkedQL gives you optional syntax shorthands that let you do more with the language, and less by hand.

LinkedQL bundles a lightweight compiler that expands each shorthand to its plain SQL form for the underlying database.

#### `1.1 |` DeepRefs

Follow relationships using simple arrow notation: `a ~> c ~> d`

```js
// DeepRefs let you access deeply nested columns
const books = await client.query(
  `SELECT 
    b.title, 
    b.content, 
    b.author ~> name AS author_name,
    b.author ~> profile ~> bio AS author_bio
  FROM books b
  WHERE b.author ~> role = $1`,
  ['admin']
);

console.log(books.rows);
// [{ title: '...', content: '...', author_name: 'John Doe', author_bio: '...' }]
```

```js
// DeepRefs can also be written to directly
const result = await client.query(
  `INSERT INTO books
    (title, content, author ~> name, author ~> profile ~> bio)
  VALUES
    ('Book Title 1', 'Hello world... (1)', 'John Doe', 'Author bio...'),
    ('Book Title 2', 'Hello world... (2)', 'Alice Blue', 'Another bio...')`
);

console.log(result.rowCount); // Number of inserted rows
```

#### `1.2 |` JSON shorthands

Model shapes visually using JSON literals: `{}`, `[]`

_a) Basic JSON object and array creation_

```js
// Shape your output data visually with JSON literals
const users = await client.query(
  `SELECT
    u.id, 
    u.first_name, 
    u.last_name,
    { 
      first: u.first_name, 
      last: u.last_name,
      full: u.first_name || ' ' || u.last_name
    } AS name,
    [ u.email, u.phone, u.website ] AS contact
  FROM users AS u
  WHERE u.active = true`
);
```

_b) Add nested objects for complex data structures_

```js
// Include nested objects for addresses and preferences
const usersWithProfile = await client.query(
  `SELECT
    u.id, 
    u.first_name, 
    u.last_name,
    {
      address: {
        street: u.street,
        city: u.city,
        country: u.country
      },
      preferences: {
        theme: u.theme_preference,
        notifications: u.notifications_enabled
      }
    } AS profile
  FROM users AS u
  WHERE u.active = true`
);

console.log(usersWithProfile.rows[0]);
/*
{
  id: 2,
  first_name: 'John',
  last_name: 'Doe',
  name: { 
    first: 'John', 
    last: 'Doe',
    full: 'John Doe'
  },
  contact: ['john@example.com', '+1234567890', 'https://johndoe.com'],
  profile: {
    address: {
      street: '123 Main St',
      city: 'New York',
      country: 'USA'
    },
    preferences: {
      theme: 'dark',
      notifications: true
    }
  }
}
*/
```

#### `1.3 |` The UPSERT statement

Do upserts with a literal UPSERT statement.

```js
// Skip the ON CONFLICT / ON DUPLICATE KEY step
const result = await client.query(
  `UPSERT INTO public.users 
    (name, email, role, updated_at)
  VALUES
    ('John Doe', 'jd@example.com', 'admin', NOW()),
    ('Alice Blue', 'ab@example.com', 'guest', NOW()),
    ('Bob Smith', 'bs@example.com', 'user', NOW())`
);

console.log(result.rowCount); // Number of upserted rows
console.log(result.rows); // Returned rows (if RETURNING clause is used)
```

---

### ` 2 |` Runtime Capabilities

Here, LinkedQL extends your database at runtime to solve the toughest parts of the modern database layer: reactivity, and schema versioning — collapsing complex tooling layers and infrastructure.

#### `2.1 |` Live Queries

Turn on reactivity over arbitrary SQL with `{ live: true }`

_a) Query_

```js
// Turn on reactivity with { live: true }
const result = await client.query(
  `SELECT 
    b.title, 
    b.content, 
    u.name AS author,
    b.created_at
  FROM books b
  LEFT JOIN users u ON b.author_id = u.id
  ORDER BY b.created_at DESC`,
  { live: true }
);

// Result rows are "live" data — continuously self-updating
console.log(result.rows); // [{ title: '...', content: '...', author: '...', created_at: '...' }]
```

_b) Make changes and see them reflect automatically_

```js
// Make changes and see them reflect in the result
await client.query(`
  INSERT INTO books (title, content, author_id)
  VALUES ('New Book', 'Fresh content...', 1)`
);

// The result automatically updates - no manual refresh needed
setTimeout(() => {
  console.log(result.rows); // Now includes the new book
}, 100);
```

_c) Stop live mode when done_

```js
// Stop live mode at any time
result.abort();
```

> [!TIP]
> For PostgreSQL, ensure you have *Logical Replication* [enabled](https://www.digitalocean.com/community/tutorials/how-to-set-up-logical-replication-with-postgresql-10-on-ubuntu-18-04) on your database. (Coming soon for MySQL; works automatically with FlashQL.)

> [!TIP] 
> "Live" objects like the above can be observed using the [Observer API](https://github.com/webqit/observer):
>
> ```js
> Observer.observe(result.rows, (changes) => console.log(changes));
> ```
>
> Alternatively, you can pass a callback along with your query to manually handle raw changefeeds from the engine:
>
> ```js
> await client.query(`SELECT ...`, (events) => console.log(events), { live: true });
> ```

> [!TIP]
> While LinkedQL fully supports the traditional callback model for manual change handling, its real strength lies in the concept of live result objects — a cleaner, more intuitive way to reason about changing data.
>
> Built for *mutation-based* reactivity, this model integrates seamlessly with newer stacks that share the same foundation, letting you pass dynamic, ever-updating data across your entire application — even over the wire — with zero glue code.
>
> As an example, the Webflo framework would let you return "live" data from a route for automatic binding on the UI — with reactivity preserved through the wire:
>
>  ```js
>  // Return "live" results over the wire from a Webflo route
>  export default async function(event, next) {
>    const result = await client.query(`SELECT ...`, { live: true });
>    return result.rows;
>  }
>  ```

#### `2.2 |` Realtime Triggers

Listen to row-level or table-level events as they happen — same API across all engines, perfect for cache invalidation, live analytics, or instant event-driven automation.

```js
// Subscribe to changes on all tables
const unsubscribe = client.subscribe((event) => {
  console.log(`Table ${event.relation.name} changed:`, {
    type: event.type,
    old: event.old,
    new: event.new
  });
});

// Subscribe to changes on specific tables
const unsubscribeSpecific = client.subscribe(
  { public: ['users', 'orders'] }, 
  (event) => {
    console.log(`Change in ${event.relation.name}:`, {
      operation: event.type,
      data: event.new
    });
  }
);

// Unsubscribe when done
unsubscribe();
unsubscribeSpecific();
```

> [!NOTE]
> 🔔 Each event includes granular metadata — `type` (`insert`/`update`/`delete`), `relation` (schema/table), and `old`/`new` row data.
> Works consistently across FlashQL, PostgreSQL, and MySQL (with logical replication enabled).

#### `2.3 |` Automatic Database Versioning (Coming Soon)

<!--⏱ Get automatic database versioning on every DDL operation-->

<!--
// A savepoint is automatically created for you on every DDL operation
const savepoint = await client.query(
  `CREATE TABLE public.users (
    id int,
    name varchar
  )
  RETURNING SAVEPOINT`,
  { desc: 'Create users table' }
);

// Inspect savepoint details
console.log(savepoint.versionTag()); // 1
console.log(savepoint.commitDesc()); // Create users table
console.log(savepoint.commitDate()); // 2024-07-17T22:40:56.786Z

// Rollback at any time (drops the table above)
await savepoint.rollback({ desc: 'Users table no more necessary' });
-->

#### `2.4 |` Semantic Version Binding (Coming Soon)

<!--🧷 Bind queries to specific schema or table versions: <table_ref | schema_ref>@<version_number>-->

<!--
// ...makes this query version-safe
await client.query(
  `SELECT users.first_name, books.title FROM users@3
  LEFT JOIN books@2_1 ON users.id = books.author`
);

// Alter your database without breaking your queries
await client.query(
  `ALTER TABLE users
  RENAME COLUMN first_name TO fname`
);
-->

---

<!--
## Features


This section moves from engine capabilities to **developer tools** and workflow.

<div>

### ⤷ _Overview_

|  |  |
|:---|:---|
| **Coming Soon** | [Schema Niceties](#schema-niceties-coming-soon) • [IDE Niceties](#ide-niceties-coming-soon) |

</div>
-->

---

## 💾 FlashQL

FlashQL is LinkedQL's embeddable database engine — complete in-memory database for client-side apps, PWAs, edge computing, and offline-first applications.

<div>

### ⤷ _Overview_

|  |  |
|:---|:---|
| **Usage** | (_basic guide_) |
| **Data Orchestration** | [Query Federation](#21--query-federation) • [Data Materialization](#22--data-materialization) • [Data Sync](#23--data-sync) |

</div>

### ` 1 |` Usage

_Run as a pure JavaScript, in-memory SQL engine — embeddable, dual-dialect, and lightweight — ideal for local-first, ephemeral, or browser environments.  
Replaces SQLite or PGLite in many contexts._

```js
// Import from the /flash namespace
import { FlashClient } from '@linked-db/linked-ql/flash';

// Initialize
const client = new FlashClient();
await client.connect();

// Run queries - understands Postgres by default: { dialect: 'postgres' }
const result1 = await client.query('SELECT 2::text as value');
console.log(result1.rows); // [{ value: '2' }]

// Switch dialect per query
const result2 = await client.query('SELECT `name` FROM `users`', { dialect: 'mysql' });
console.log(result2.rows); // [{ name: '...' }]

// Clean up
await client.disconnect();
```

_Comes pretty robust — supporting advanced language features, including aggregate & window functions, advanced analytics (`GROUPING`, `ROLLUP`, `CUBE`), *set* operations (`UNION`, `INTERSECT`, `EXCEPT`),  Common Table Expressions (CTEs), and more._

```js
// Advanced FlashQL example with CTEs and window functions
const { rows } = await client.query(`
    WITH updated AS (
        UPDATE users
        SET status = 'inactive'
        WHERE last_login < NOW() - INTERVAL '30 days'
        RETURNING id, status, last_login
    ), ranked AS (
        SELECT 
            id, 
            status, 
            ROW_NUMBER() OVER (ORDER BY last_login DESC) AS login_rank
        FROM updated
    )
    SELECT 
        r.id, 
        r.status, 
        r.login_rank,
        u.name
    FROM ranked r
    LEFT JOIN users u ON r.id = u.id
    ORDER BY r.login_rank
`);

console.log(rows); // Processed inactive users with ranking
```

> [!NOTE]
> FlashQL runs anywhere JavaScript runs — Node.js, browser, worker, or edge — and is designed for future pluggable backends (IndexedDB, Redis, etc.).

### ` 2 |` Data Orchestration

Seamlessly work with data across multiple sources — federate queries, materialize datasets, and sync changes between local and remote databases.

#### `2.1 |` Query Federation

Query across multiple database systems in one statement — perfect for hybrid setups where data lives across local and remote sources.

_a) Setup: Initialize client with remote connection factory_

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
import { PGClient } from '@linked-db/linked-ql/pg';

// Initialize local FlashQL client with remote connection factory
const local = new FlashClient({
  onCreateRemoteClient: async (remoteClientOpts) => {
    const remote = new PGClient(remoteClientOpts);
    await remote.connect();
    return remote;
  },
});

await local.connect();
```

_b) Federate your first remote dataset_

```js
// Use this connection
const remoteClientOpts1 = { 
  host: 'localhost', 
  port: 5432,
  database: 'production'
};
// Federate under the local namespace "public" (and from the remote namespace "public")
await local.federate({ public: ['users', 'orders'] }, remoteClientOpts1);
```

_c) Federate another dataset — with filtering, this time_

```js
// Use this connection
const remoteClientOpts2 = { 
  connectionString: 'postgresql://user:pass@remote-db:5432/analytics'
};
// Federate under the local namespace "pg1" (and from the remote namespace "public")
await local.federate(
  {
    pg1: {
      namespace: 'public',
      name: 'products',
      filters: { status: 1 } // Optional filter
    }
  },
  remoteClientOpts2
);
```

_d) Federate a third dataset - using raw SQL for complex querying, this time_

```js
// Federate under the local namespace "analytics" (and from whatever remote namespaces the query touches)
await local.federate(
  { 
    analytics: { 
      query: 'SELECT * FROM public.events WHERE created_at > NOW() - INTERVAL \'7 days\'' 
    } 
  },
  remoteClientOpts2
);
```

_e) Query across all federated sources on the fly_

> LinkedQL automatically routes the relevant parts of your query to their respective origins and streams results back into the working dataset. 

```js
// Note: An active connection to each remote database is required at query time
const result = await local.query(`
  SELECT 
    u.id, 
    u.name,
    o.total, 
    p.name as product_name,
    e.event_type
  FROM public.users u
  JOIN public.orders o ON u.id = o.user_id
  JOIN pg1.products p ON o.product_id = p.id
  LEFT JOIN analytics.events e ON u.id = e.user_id
  WHERE o.created_at > NOW() - INTERVAL '30 days'
  ORDER BY o.total DESC
`);

console.log(result.rows); // Federated query results

// Clean up
await local.disconnect();
```

> [!NOTE]
> Federation is lazy — data is streamed on demand, not bulk-copied — ideal for hybrid setups where part of your data lives remotely. Each query execution requires network access to the relevant remote origins.

#### `2.2 |` Data Materialization

Materialize remote datasets locally for offline-first, edge-first, and distributed apps.

_a) Setup: Initialize client with remote connection factory_

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
import { PGClient } from '@linked-db/linked-ql/pg';

// Initialize local client with remote connection factory
const local = new FlashClient({
  onCreateRemoteClient: async (remoteClientOpts) => {
    const remote = new PGClient(remoteClientOpts);
    await remote.connect();
    return remote;
  },
});

await local.connect();
```

_b) Materialize your first remote dataset_

> Executes immediately and materializes the data locally

```js
// Use this connection
const remoteClientOpts1 = { 
  host: 'localhost', 
  port: 5432,
  database: 'production'
};
// Materialize into the local namespace "public" (and from the remote namespace "public")
await local.materialize({ public: ['users', 'orders'] }, remoteClientOpts1);
```

_c) Materialize another dataset - with filtering, this time_

> Executes immediately and materializes the data locally

```js
// Use this connection
const remoteClientOpts2 = { 
  connectionString: 'postgresql://user:pass@remote-db:5432/analytics'
};
// Materialize into the local namespace "pg1" (and from the remote namespace "public")
await local.materialize(
  {
    pg1: {
      namespace: 'public',
      name: 'products',
      filters: { status: 1 } // Optional filter
    }
  },
  remoteClientOpts2
);
```

_d) Materialize a third dataset - using raw SQL for complex querying, this time_

> Executes immediately and materializes the data locally

```js
// Materialize into the local namespace "analytics" (and from whatever remote namespaces the query touches)
await local.materialize(
  { 
    analytics: { 
      query: 'SELECT * FROM public.events WHERE created_at > NOW() - INTERVAL \'7 days\'' 
    } 
  },
  remoteClientOpts2
);
```

_e) Query materialized data from the local DB_

> This time, works even in offline (no network) node

```js
// BOTE: No active connection is required
const result = await local.query(`
  SELECT 
    u.id, 
    u.name,
    o.total, 
    p.name as product_name,
    e.event_type
  FROM public.users u
  JOIN public.orders o ON u.id = o.user_id
  JOIN pg1.products p ON o.product_id = p.id
  LEFT JOIN analytics.events e ON u.id = e.user_id
  WHERE o.created_at > NOW() - INTERVAL '30 days'
  ORDER BY o.total DESC
`);

console.log(result.rows); // Works offline - data is materialized locally

// Clean up
await local.disconnect();
```

> [!NOTE]
> **Key difference from Federation**: Each `materialize()` operation executes immediately and copies remote data into the local DB, enabling offline queries. By contrast, query execution for federated origins happens at actual query time and requires an active connection to each relevant origin.

#### `2.3 |` Data Sync

Two-way data synchronization between local and remote databases — perfect for offline-first, edge-first, and distributed apps.

_a) Setup: Initialize client with remote connection factory_

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
import { PGClient } from '@linked-db/linked-ql/pg';

// Initialize local client with remote connection factory
const local = new FlashClient({
  onCreateRemoteClient: async (remoteClientOpts) => {
    const remote = new PGClient(remoteClientOpts);
    await remote.connect();
    return remote;
  },
});

await local.connect();
```

_b) Sync with your first remote dataset_

> Materializes data immediately and activates two-way synchronization between local and remote

```js
// Use this connection
const remoteClientOpts1 = { 
  host: 'localhost', 
  port: 5432,
  database: 'production'
};
// Sync between the local namespace "public" (and the remote namespace "public")
await local.sync(
  { public: ['users', 'orders'] }, 
  remoteClientOpts1
);
```

_c) Make local changes and see them sync back automatically_

```js
// Create new record in dataset
await local.query(`
  INSERT INTO users (name, email) 
  VALUES ('New User', 'user@example.com')
`);

// Update existing record
await local.query(`
  UPDATE orders 
  SET status = 'completed' 
  WHERE id = 123
`);
```

> [!NOTE]
> **Key difference from Materialization**: `sync()` provides bidirectional synchronization. While materialization is one-way (remote → local), and one-off, sync materializes (remote → local) **live mode**, and syncs local changes back to their respective origins (local → remote) - either as they happen or as connectivity allows. Does automatic conflict handling.
>
> `.sync()` is in _alpha_.

---

## 📚 Documentation

> Comprehensive documentation coming soon.

## ⏳ Development Progress

| Component              | Status        | Notes                    |
|:-----------------------|:--------------|:-------------------------|
| **Core Parser/Compiler**   | 🟩🟩🟩🟩 `100%` | ✅ Complete              |
| **Core Transform Engine**  | 🟩🟩🟩🟩 `100%` | ✅ Complete              |
| **InMemory DB Engine**     | 🟩🟩🟩🟩 `99%`  | 🚀 Stable, expanding    |
| **DB Mirroring Engine**    | 🟩🟩🟩🟩 `99%`  | 🚀 Complete, `.sync()` in alpha |
| **DB Drivers (PG/MySQL)**  | 🟩🟩🟩🟩 `97%`  | 🚀 MySQL catching up    |
| **Realtime Engine**        | 🟩🟩🟩🟩 `99%`  | 🚀 Stable, expanding    |
| **Version Binding**        | 🟩⬜⬜⬜ `20%`  | 🔧 Early prototype      |
| **Auto-Versioning Engine** | 🟩⬜⬜⬜ `10%`  | ⏳ Deferred to v0.3.*   |
| **Migration Wizard**       | 🟩⬜⬜⬜ `10%`  | ⏳ Deferred to v0.3.*   |
| **IDE Tooling**            | 🟩⬜⬜⬜ `5%`   | 🔧 Initial hooks only   |
| **Revamped Docs**          | ⬜⬜⬜⬜ `0%`    | 📝 Not started          |

> 💡 **Status Legend**: 🟩 Complete | 🟨 In Progress | ⬜ Not Started  
> 🚀 **Active Development**: Core features are stable and expanding rapidly

## 🤝 Contributing

LinkedQL is in active development — and contributions are welcome!  

Here’s how you can jump in:  
- **Issues** → Spot a bug or have a feature idea? Open an [issue](https://github.com/linked-db/linked-ql/issues).  
- **Pull requests** → PRs are welcome for fixes, docs, or new ideas.  
- **Discussions** → Not sure where your idea fits? Start a [discussion](https://github.com/linked-db/linked-ql/discussions).  

### 🛠️ Local Setup

⤷ clone → install → test

```bash
git clone https://github.com/linked-db/linked-ql.git
cd linked-ql
git checkout next
npm install
npm test
```

### 📝 Tips

- Development happens on the `next` branch — be sure to switch to it as above after cloning.
- Consider creating your feature branch from `next` before making changes (e.g. `git checkout -b feature/my-idea`).
- Remember to `npm test` before submitting a PR.
- Check the [Progress](#-our-progress-on-this-iteration-of-linkedql) section above to see where help is most needed.

## 🔑 License

MIT — see [LICENSE](https://github.com/linked-db/linked-ql?tab=MIT-1-ov-file)

[npm-version-src]: https://img.shields.io/npm/v/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/@linked-db/linked-ql
[npm-downloads-src]: https://img.shields.io/npm/dm/@linked-db/linked-ql?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/@linked-db/linked-ql
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@linked-db/linked-ql@next?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=@linked-db/linked-ql@next
[license-src]: https://img.shields.io/github/license/linked-db/linked-ql.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/linked-db/linked-ql/blob/next/LICENSE
