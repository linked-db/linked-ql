# LinkedQL Guides

This section helps you plug LinkedQL into a real application — whether your database lives locally, on a server, or across runtime boundaries.

Your final setup remains: one query interface, regardless of where your data lives.

---

## Choose Your Guide

The following is a map of the LinkedQL guide that fits a specific scenario or application shape.

| Shape                    | Use it when                                                                                      | Start here                                                                           |
| :----------------------- | :----------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| Direct database querying | your app can connect to the database directly                                                    | [PostgreSQL](/guides/postgresql), [MySQL](/guides/mysql), [MariaDB](/guides/mariadb) |
| Cross-runtime querying   | your app runs in the browser, edge, or another boundary and needs remote DB access               | [Edge](/guides/edge)                                                                 |
| Local-first querying     | you want the database inside the app, with optional upstream sync                                | [FlashQL](/guides/flashql)                                                           |
| Hybrid architectures     | your app spans multiple runtimes (client, edge, server) and needs to compose queries across them | [Integration Patterns](/guides/integration-patterns)                                 |

---

## Installation

Install the package from npm:

```bash
npm install @linked-db/linked-ql
```

Each entry point corresponds to a deployment shape — you only import what your app needs.

| Client          | Import Path                        | Guide                            |
| :-------------- | :--------------------------------- | :------------------------------- |
| `PGClient`      | `@linked-db/linked-ql/postgres`    | [PostgreSQL](/guides/postgresql) |
| `MySQLClient`   | `@linked-db/linked-ql/mysql`       | [MySQL](/guides/mysql)           |
| `MariaDBClient` | `@linked-db/linked-ql/mariadb`     | [MariaDB](/guides/mariadb)       |
| `FlashQL`       | `@linked-db/linked-ql/flashql`     | [FlashQL](/guides/flashql)       |
| `EdgeClient`    | `@linked-db/linked-ql/edge`        | [Edge](/guides/edge)             |
| `EdgeWorker`    | `@linked-db/linked-ql/edge-worker` | [Edge](/guides/edge)             |

---

## Core Interface

Every LinkedQL client — whether local, direct, or remote — implements the same contract:

```js
await db.query(sql, options);
await db.query(sql, { live: true, ...options });
await db.stream(sql, options);
await db.transaction(fn);
await db.wal.subscribe(selector, handler);
```

This means you can switch between PostgreSQL, FlashQL, or Edge-backed queries without rewriting your data layer.

Some runtimes extend the base interface. For example, FlashQL adds a sync API:

```js
await db.sync.sync(); // (FlashQL)
```

See the [Core Query API](/api) section for details.

---

## Enabling Realtime

Across database engines or client APIs, LinkedQL's realtime capabilities are always exposed the same way:

```js
// Live queries
await db.query('SELECT * FROM users', { live: true });
```

```js
// Chnagefeeds subscriptions
await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

However, the underlying database must support change tracking.

On a PostgreSQL database, for example, this requires logical replication to be enabled. Similar requirements apply to MySQL and MariaDB, which rely on Binary Logging (Binlog).

See the relevant section of the docs for details.

| Database / Model | Enabling Realtime                                  | Docs                                                     |
| :--------------- | :------------------------------------------------- | :------------------------------------------------------- |
| PostgreSQL       | requires logical replication enabled               | [PostgreSQL realtime setup](/guides/postgresql#realtime-setup) |
| MySQL            | requires Binary Logging (Binlog) enabled           | [MySQL realtime setup](/guides/mysql#realtime-setup)           |
| MariaDB          | requires Binary Logging (Binlog) enabled           | [MariaDB realtime setup](/guides/mariadb#realtime-setup)       |
| FlashQL          | supports realtime out of the box                   | [FlashQL realtime notes](/guides/flashql#realtime-notes)       |
| Edge Connection  | inherits the support mode of the upstream database | [Edge realtime notes](/guides/edge#realtime-notes)             |

---

## Runtime Tuning and Operational Flags

In addition to dialect-specific configuration, LinkedQL clients also support operational configurations that tune how the client behaves at runtime.

Use these to balance performance and operational requirements.

### `nonDDLMode`

`nonDDLMode` assumes your schema will not change while the process is running.

```js
const db = new PGClient({
  host: 'localhost',
  database: 'myapp',
  nonDDLMode: true,
});
```

When enabled, LinkedQL can safely keep schema inference work cached in memory for the lifetime of the process.

In practice, this means:

* lower repeated schema-inference overhead
* better fit for production applications with stable deployed schema
* but stale schema snapshots in local/dev environments where schema changes are frequent

Use it when:

* migrations run outside the app process
* the app treats schema as fixed during normal runtime

Leave it off when:

* migrations can run while the process is alive
* the app issues DDL dynamically
* you are in exploratory/dev flows where schema churn is normal

---

## Security and Access Control

LinkedQL does not bypass or reimplement database security for the given database — it composes directly with it. This includes PostgreSQL's Row Level Security (RLS) architecture.

Security and Access Control concepts are documented alongside relevant LinkedQL features or capabilities. The table below is your map to those sections of the docs:

| Concern                                                                 | Where to look                                                                           |
| :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| Establishing a security boundary for live queries                       | [Live Queries: Visibility and Security](/realtime/live-queries#visibility-and-security) |
| Establishing a security boundary for changefeed subscriptions           | [Changefeeds: Visibility and Security](/realtime/changefeeds#visibility-and-security)   |
| Implementing authentication or role-based connections over `EdgeClient` | [Edge Guide](/guides/edge)                                                              |

---

## Additional Reading

| If you want to learn about... | Go to... |
| :---------------------------------------------------- | :--------------------------------------------------- |
| the method-by-method contract             | [API](/api)                                         |
| LinkedQL syntax extensions to SQL         | [Language](/lang)                                   |
| LinkedQL realtime capabilities            | [Realtime](/realtime)                               |
