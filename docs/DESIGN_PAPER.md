# LinkedQL: A Modern Database Abstraction with Realtime Capabilities

## Abstract

LinkedQL is a unified database abstraction layer that extends standard SQL with modern syntax enhancements and provides built-in realtime capabilities. It offers a single API that spans multiple database engines (PostgreSQL, MySQL/MariaDB, and an in-memory FlashQL engine) while introducing novel features including live queries, data synchronization, and syntax extensions like DeepRefs and JSON shorthands. This paper presents the design and architecture of LinkedQL, demonstrating how it addresses the complexity of modern database interactions while maintaining SQL compatibility and introducing innovative realtime data capabilities.

## 1. Introduction

### 1.1 Motivation

Modern applications increasingly require:
- **Universal database access**: Support for multiple database engines with consistent APIs
- **Realtime capabilities**: Live data updates without complex middleware or GraphQL servers
- **Enhanced syntax**: Reduced boilerplate and improved developer experience
- **Local-first architecture**: Offline capabilities and edge computing support

Traditional approaches often require:
- Multiple database drivers with different APIs
- Complex realtime middleware (GraphQL subscriptions, WebSockets)
- Verbose SQL for common operations
- Separate tooling for schema management and migrations

LinkedQL addresses these challenges by providing a unified abstraction that extends SQL with modern capabilities while maintaining compatibility with existing database systems.

### 1.2 Design Goals

1. **Universal SQL**: Single API across PostgreSQL, MySQL/MariaDB, and in-memory engines
2. **Realtime SQL**: Built-in reactivity without external middleware
3. **Syntax Enhancement**: Reduced boilerplate through language extensions
4. **Schema Management**: Automatic versioning and migration capabilities
5. **Developer Experience**: Type safety, static analysis, and IDE integration

## 2. Architecture Overview

### 2.1 Core Architecture

LinkedQL follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│                    LinkedQL API                            │
├─────────────────────────────────────────────────────────────┤
│  Client Abstraction  │  Realtime Engine  │  Language Layer │
├─────────────────────────────────────────────────────────────┤
│  Database Drivers    │  Query Engine     │  Parser/Compiler │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL  │  MySQL  │  FlashQL  │  Storage Engine      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Client Abstraction

The `AbstractClient` provides the base interface for all database interactions:

```javascript
class AbstractClient extends SimpleEmitter {
    async query(query, options = {}) { /* ... */ }
    async connect() { /* ... */ }
    async disconnect() { /* ... */ }
    subscribe(callback) { /* ... */ }
}
```

Specific implementations include:
- `PGClient`: PostgreSQL with logical replication support
- `MySQLClient`: MySQL/MariaDB with binary logging
- `FlashClient`: In-memory JavaScript engine with dual dialect support

### 2.3 Database Engine Support

#### 2.3.1 Classic Database Clients

LinkedQL provides drop-in replacements for standard database drivers:

```javascript
// PostgreSQL
import { PGClient } from '@linked-db/linked-ql/pg';
const pg = new PGClient({ host: 'localhost', port: 5432 });

// MySQL
import { MySQLClient } from '@linked-db/linked-ql/mysql';
const mysql = new MySQLClient({ host: 'localhost', port: 3306 });
```

#### 2.3.2 FlashQL In-Memory Engine

FlashQL is a pure JavaScript SQL engine that supports:
- Dual dialect support (PostgreSQL and MySQL)
- Advanced SQL features (CTEs, window functions, analytics)
- Embeddable in any JavaScript environment
- Local-first and edge computing support

```javascript
import { FlashClient } from '@linked-db/linked-ql/flash';
const client = new FlashClient({ dialect: 'postgres' });
```

## 3. Language Extensions

### 3.1 DeepRefs: Relationship Navigation

DeepRefs allow navigation through relationships using arrow notation:

```sql
-- Traditional SQL
SELECT b.title, b.content, u.name AS author_name 
FROM books b 
JOIN users u ON b.author = u.id 
WHERE u.role = 'admin';

-- LinkedQL DeepRefs
SELECT title, content, author ~> name AS author_name 
FROM books 
WHERE author ~> role = 'admin';
```

The `~>` operator follows foreign key relationships automatically, reducing JOIN boilerplate.

### 3.2 JSON Shorthands

LinkedQL supports JSON literals for structured data:

```sql
SELECT 
    u.id, u.first_name, u.last_name,
    { first: u.first_name, last: u.last_name } AS name,
    [ u.email, u.phone ] AS contact
FROM users u;
```

This produces structured output:
```javascript
{
  id: 2,
  first_name: 'John',
  last_name: 'Doe',
  name: { first: 'John', last: 'Doe' },
  contact: ['john@example.com', '012345678']
}
```

### 3.3 UPSERT Statement

LinkedQL introduces a dedicated UPSERT statement:

```sql
-- Traditional approach
INSERT INTO users (name, email, role) 
VALUES ('John Doe', 'jd@example.com', 'admin')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- LinkedQL UPSERT
UPSERT INTO users (name, email, role) 
VALUES ('John Doe', 'jd@example.com', 'admin');
```

### 3.4 Parser and Compiler Architecture

LinkedQL uses a sophisticated parser/compiler pipeline:

1. **Tokenization**: Multi-dialect tokenizer with dialect-specific rules
2. **Parsing**: AST construction with support for extensions
3. **Transformation**: Query optimization and dialect translation
4. **Execution**: Engine-specific query execution

The parser supports:
- Custom operators (`~>`, `<~`)
- Version specifications (`table@1_2`)
- JSON literals and structured data
- Dialect-specific syntax variations

## 4. Realtime System

### 4.1 Introduction to the Realtime Engine

Traditional realtime database systems treat each query as an isolated subscription, leading to exponential computational overhead as the number of concurrent queries grows. Even queries that share significant structural similarity—such as filtering the same table with different conditions—maintain separate change streams and recompute results independently.

LinkedQL's **Realtime SQL Fabric** revolutionizes this approach through **query inheritance**—a hierarchical model where queries sharing common logical bases are organized into parent-child relationships. Instead of duplicating computation, the system creates a tree of **canonical windows** and **subwindows** that share computation and event streams while maintaining query-specific refinements.

This architectural innovation enables:

- **Computational Efficiency**: Cost scales with query diversity, not subscription count
- **Fine-Grained Reactivity**: Row-level and column-level updates propagate through the hierarchy
- **SQL-Native Realtime**: No middleware, GraphQL layers, or local database replicas required
- **Automatic Optimization**: The system dynamically reorganizes query hierarchies for optimal performance

The result is a realtime system that behaves as if SQL itself is inherently reactive—where every query result automatically updates as underlying data changes, with computational cost proportional to the complexity of the query structure rather than the number of active listeners.

---

## **Chapter 4 — Query Inheritance and Execution Strategies**

### 4.2 Introduction

In most realtime database systems, every active query represents a self-contained computation. Even if two queries differ only slightly in filters or ordering, each still maintains its own live subscription to database changes and recomputes its own results. This model is simple but inefficient — it ignores structural similarity between queries and repeats work that could have been shared.

The **Realtime SQL Fabric** introduces a different approach: **query inheritance**.
Queries that share the same logical base — their *FROM* graph and join conditions — are organized into a hierarchy where broader queries become **canonical windows** and narrower, more constrained queries become **subwindows**.
Each window observes mutations in real time but computes only what is unique to its frame, inheriting shared computation and event streams from its parent.

This model scales from trivial one-table lookups to deeply nested aggregations while keeping computation proportional to the complexity of the query, not the number of concurrent listeners.

---

### 4.3 Query Windows and Canonical Frames

Every live `SELECT` statement forms a **query window**, representing a continuously maintained view of its result set.
A canonical or *least-constrained* window is one whose filtering and limiting clauses are minimal — typically something like:

```sql
SELECT * FROM users;
```

From this, many narrower windows can be derived:

```sql
SELECT * FROM users WHERE active;
SELECT * FROM users WHERE active AND country='US';
SELECT id, name FROM users WHERE active AND country='US' ORDER BY created_at DESC;
```

Each derived query represents a **subwindow**: it inherits its base data stream from the canonical window and locally applies extra filtering, projection, or ordering.
Because all these windows share the same `FROM` graph (`users`), updates from the database propagate once through the canonical stream and cascade to each dependent window with minimal recomputation.

```
┌─────────────────────────────────────────────────────────────┐
│                    Query Inheritance Tree                   │
├─────────────────────────────────────────────────────────────┤
│  Canonical Window: SELECT * FROM users                     │
│  ├─ Subwindow: WHERE active                                │
│  │  ├─ Subwindow: WHERE active AND country='US'           │
│  │  │  └─ Subwindow: SELECT id, name ORDER BY created_at  │
│  │  └─ Subwindow: WHERE active AND role='admin'            │
│  └─ Subwindow: WHERE created_at > '2024-01-01'             │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.4 Detecting Inheritance

When a new query is issued, the engine analyses its structure against all active windows connected to the same base tables.
The function `intersectQueries(parent, child)` evaluates whether one can be derived from the other.

This comparison is clause-by-clause:

| Clause             | Inheritance Rule                         | Meaning                                                                     |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| **FROM / JOIN**    | Must match exactly                       | Same tables and join graph.                                                 |
| **WHERE**          | Child must be equal or stricter          | All parent filters must hold; child may add more.                           |
| **ORDER BY**       | Child may reorder locally unless limited | Order equivalence is relaxed if no limit/offset.                            |
| **LIMIT / OFFSET** | Child must fit inside parent's range     | `LIMIT 10` inherits from `LIMIT 20`; `OFFSET 10` inherits from `OFFSET 5`.  |
| **Projection**     | Flexible (non-SSR) or strict (SSR)       | Child may use subset of columns unless server-side rendering (SSR) applies. |

If these conditions hold, a **mapping** is created describing how to construct the child's frame from its parent's: which rows to filter, which columns to project, and what slice of ordering to apply. Otherwise, the child becomes its own canonical window.

---

### 4.5 Expression Canonicalization

Two queries can be semantically identical even when written differently.
To detect equivalence, the engine canonicalizes expressions before comparing them.
This includes:

* Treating logical conjunctions as commutative (`A AND B` = `B AND A`).
* Normalizing operators (`!=` and `<>` unified; `a > b` = `b < a`).
* Reducing nested parentheses and redundant constants.
* Recognizing equivalent NULL and DISTINCT checks.

Thus:

```sql
WHERE id IS NOT NULL AND 0 != id
```

is treated the same as:

```sql
WHERE id <> 0 AND id IS NOT NULL
```

This operator canonicalization prevents trivial syntax differences from producing redundant windows.

---

### 4.6 Clause-Specific Behavior

#### WHERE Clauses

The simplest inheritance form. If the child's condition set is a superset of the parent's, it inherits.

```sql
Parent: SELECT * FROM users WHERE active;
Child : SELECT * FROM users WHERE active AND country='US';
```

The engine identifies `country='US'` as an additional constraint and applies it locally.

#### Projection Lists

In **non-SSR mode**, windows carry full row objects; children can freely pick or alias any subset of fields.

```sql
Parent: SELECT * FROM users;
Child : SELECT name, email FROM users;
```

In **SSR mode**, the server precomputes all expressions, so inheritance is only allowed if the child's selected items map directly to existing parent fields.

#### ORDER BY, LIMIT, OFFSET

Ordering is inherited loosely unless pagination semantics make it strict.
If `LIMIT` or `OFFSET` are present, both ordering keys and directions must match to preserve determinism.
Otherwise, local resorting is permitted:

```sql
Parent: SELECT * FROM users ORDER BY created_at DESC;
Child : SELECT * FROM users ORDER BY created_at ASC;
```

Allowed — local reordering.

```sql
Parent: SELECT * FROM users ORDER BY id LIMIT 100;
Child : SELECT * FROM users ORDER BY name LIMIT 10;
```

Blocked — conflicting limit and ordering dimensions.

#### GROUP BY and Aggregations

Aggregation, window functions, and subselects move a window into **SSR mode**.
Inline evaluation is no longer possible, but inheritance may still hold if both queries compute compatible aggregates.

```sql
Parent: SELECT user_id, COUNT(*) AS total FROM orders GROUP BY user_id;
Child : SELECT COUNT(*) AS total FROM orders GROUP BY user_id;
```

Permitted — child's projection maps directly to parent's aggregate.

---

### 4.7 Strategy Selection

Each query window is assigned a **strategy** based on its complexity.
Strategies determine how the engine maintains the window in realtime — whether it recomputes locally, queries partially, or defers to the database.

| Strategy      | Description                                      | Suitable For                                      | Cost Profile          |
| ------------- | ------------------------------------------------ | ------------------------------------------------- | --------------------- |
| **Local**     | Evaluate everything in memory using live events. | Simple one-table queries without aggregates.      | Near-zero.            |
| **Selective** | Re-query only affected keys on change.           | Multi-table joins and filters.                    | Small roundtrips.     |
| **Wholistic** | Recompute full result to ensure correctness.     | Aggregations, offsets, or uncertain dependencies. | Moderate.             |
| **SSR**       | Let the DB compute and return evaluated results. | Aggregates, window functions, subqueries.         | Highest, but precise. |

These strategies form a continuum between efficiency and precision.
The planner chooses the lightest viable strategy during query analysis, then escalates dynamically if runtime complexity increases (for example, when a query adds a window function).

```
┌─────────────────────────────────────────────────────────────┐
│                Strategy Selection Flow                      │
├─────────────────────────────────────────────────────────────┤
│  Query Analysis                                            │
│  ├─ Has Aggregates/Window Functions? → SSR Mode            │
│  ├─ Multi-table Joins? → Selective Strategy                 │
│  ├─ Complex WHERE/ORDER BY? → Wholistic Strategy            │
│  └─ Simple Single Table? → Local Strategy                   │
│                                                             │
│  Runtime Escalation                                         │
│  ├─ Query Complexity Increases → Upgrade Strategy          │
│  └─ Performance Degrades → Fallback to Higher Strategy     │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.8 SSR Mode and Inline Evaluation

A query enters **SSR mode** when it contains expressions that cannot be evaluated inline — such as aggregates, grouping, window functions, or subselects within the projection or ordering clauses.
In this mode, the server performs the full evaluation, returning rows with an internal key and ordinality so that client-side ordering and diffing remain possible.

Inheritance under SSR mode is more restrictive:

* Projection mappings must align exactly.
* WHERE clauses must be identical (no local filtering).
* ORDER BY keys and directions must match.

This ensures deterministic recomputation and allows consistent incremental updates even when complex SQL constructs are involved.

---

### 4.9 Retrospective Inheritance

Inheritance is **retroactive**.
The order of query creation does not matter.
If a narrower query is created before a broader one, the runtime later promotes the broader query to canonical status and reattaches the narrower one beneath it.

Example:

```sql
First:  SELECT * FROM users WHERE id > 10 AND country='US';
Later:  SELECT * FROM users WHERE id > 10;
```

The latter becomes canonical once it arrives. The earlier query becomes a subwindow automatically.

---

### 4.10 Efficiency and Granularity

Inheritance minimizes redundant computation at both server and client levels:

* The database emits a single mutation event per table change.
* The canonical window applies it once, diffing or resorting as needed.
* All subwindows reuse that updated state and emit fine-grained patches downstream.

Client applications typically receive **row-level diffs**, **ordering swaps**, or even **column-level patches** when integrated with the Observer API stack.
This creates *fine-grained reactivity* that begins at the database and propagates through to the UI without redundant computation or polling.

```
┌─────────────────────────────────────────────────────────────┐
│              Event Propagation Flow                         │
├─────────────────────────────────────────────────────────────┤
│  Database Change Event                                     │
│  ├─ Canonical Window Processing                            │
│  │  ├─ Apply Change to Base Data                           │
│  │  ├─ Compute Diffs/Reordering                            │
│  │  └─ Emit to Subwindows                                  │
│  └─ Subwindow Processing                                   │
│      ├─ Apply Local Filters/Projections                    │
│      ├─ Emit Row-Level Diffs                               │
│      └─ Propagate to UI Components                          │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.11 Scaling Behavior

Because queries are linked by inheritance rather than duplicated, computational cost scales with **query diversity**, not **subscription count**.
Simple filters remain lightweight, while complex windows pay cost proportional to their structural complexity (joins, aggregates, and total row volume).
The system's planner optimizes automatically: minimal overhead for trivial queries, exactness for advanced SQL features.

**Performance Characteristics:**

- **Linear Scaling**: O(n) where n = query diversity, not subscription count
- **Memory Efficiency**: Shared computation reduces memory footprint
- **Network Optimization**: Single change stream per table, not per query
- **CPU Optimization**: Incremental updates vs. full recomputation

---

### 4.12 Data Synchronization

LinkedQL supports bidirectional data sync with the same inheritance principles:

```javascript
// Materialize remote data locally
await local.materialize(
  { public: ['users', 'orders'] }, 
  remoteClientOpts
);

// Two-way sync with inheritance
await local.sync(
  { public: ['users', 'orders'] }, 
  remoteClientOpts
);
```

The sync system applies the same window inheritance model to materialized data, ensuring efficient propagation of changes between local and remote sources.

---

### 4.13 Realtime Triggers

Subscribe to database changes with fine-grained control:

```javascript
// All tables
client.subscribe((event) => {
  console.log(event.type, event.relation.name, event.new);
});

// Specific tables
client.subscribe({ public: ['users', 'orders'] }, (event) => {
  console.log(event.type, event.relation.name, event.new);
});
```

Triggers integrate with the query inheritance system, ensuring that subscription events are efficiently distributed through the window hierarchy.

---

### 4.14 Summary

Query inheritance redefines how realtime data systems treat similarity between SQL statements.
Rather than isolating each query as an independent subscription, the Realtime SQL Fabric organizes them into a hierarchy of shared computation.
Canonical windows hold the broadest state, while subwindows refine it locally.
Combined with the strategy system — local, selective, wholistic, and SSR — this model yields a continuum of precision and efficiency that mirrors SQL's own expressive depth.

The result is a system that behaves like SQL itself is reactive: fine-grained, logically consistent, and cost-proportional — without any intermediary servers, GraphQL layers, or local database replicas.
It is SQL reactivity as a first-class runtime property, not an afterthought.

## 5. Implementation Details

### 5.1 Query Engine Architecture

The FlashQL query engine implements:

```javascript
class QueryEngine extends SimpleEmitter {
    #storageEngine;
    #exprEngine;
    
    async #evaluateSTMT(stmt, queryCtx) {
        // Query execution logic
        // Support for CTEs, subqueries, analytics
    }
}
```

Features include:
- Advanced SQL support (CTEs, window functions, analytics)
- Correlated subquery handling
- Expression evaluation engine
- Result streaming and pagination

### 5.2 Storage Engine

The storage engine provides:
- Table and index management
- Transaction support
- Conflict resolution
- Namespace isolation

### 5.3 Federation and Materialization

LinkedQL supports query federation across multiple data sources:

```javascript
// Federate remote data
await local.federate(
  { pg1: { query: 'SELECT * FROM products WHERE status = 1' } },
  remoteClientOpts
);

// Query across local and federated data
const result = await local.query(`
  SELECT users.id, orders.total, products.name
  FROM public.users
  JOIN public.orders ON users.id = orders.user_id
  JOIN pg1.products ON orders.product_id = products.id
`);
```

## 6. Use Cases and Examples

### 6.1 Local-First Applications

```javascript
// Offline-capable app with sync
const local = new FlashClient();
await local.sync({ public: ['users', 'posts'] }, remoteDB);

// Works offline, syncs when online
const posts = await local.query(
  `SELECT * FROM posts WHERE author ~> name = $1`,
  ['John'],
  { live: true }
);
```

### 6.2 Real-time Dashboards

```javascript
// Live analytics dashboard
const analytics = await client.query(`
  SELECT 
    DATE(created_at) as date,
    COUNT(*) as posts,
    { total: COUNT(*), avg: AVG(length) } as stats
  FROM posts 
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY date
`, { live: true });

// Dashboard automatically updates
```

### 6.3 Multi-Database Applications

```javascript
// Query across multiple databases
const pg = new PGClient(pgConfig);
const mysql = new MySQLClient(mysqlConfig);

// Unified API across engines
const pgUsers = await pg.query('SELECT * FROM users');
const mysqlOrders = await mysql.query('SELECT * FROM orders');
```

## 7. Future Work

### 7.1 Schema Management

Planned features include:
- **Automatic Versioning**: Savepoints on DDL operations
- **Version Binding**: Query against specific schema versions
- **Diff-based Migrations**: Declarative schema evolution

```sql
-- Future syntax
SELECT users.first_name, books.title 
FROM users@3 
LEFT JOIN books@2_1 ON users.id = books.author;
```

### 7.2 IDE Integration

Planned tooling:
- **Static Error Checking**: Catch errors before execution
- **Type Safety**: Strong typing for queries and results
- **Autocompletion**: Smart suggestions in editors

### 7.3 Performance Optimizations

- Query plan optimization
- Index recommendation
- Caching strategies
- Connection pooling enhancements

## 8. Conclusion

LinkedQL represents a significant advancement in database abstraction, providing:

1. **Unified API**: Single interface across multiple database engines
2. **Realtime Capabilities**: Built-in live queries without middleware
3. **Enhanced Syntax**: Reduced boilerplate through language extensions
4. **Local-First Support**: Offline capabilities and edge computing
5. **Developer Experience**: Modern tooling and IDE integration

The system successfully balances SQL compatibility with modern requirements, offering a practical solution for contemporary application development while maintaining the familiarity and power of SQL.

## References

- LinkedQL GitHub Repository: https://github.com/linked-db/linked-ql
- PostgreSQL Logical Replication: https://www.postgresql.org/docs/current/logical-replication.html
- MySQL Binary Logging: https://dev.mysql.com/doc/refman/8.0/en/binary-log.html
- Observer API: https://github.com/webqit/observer
