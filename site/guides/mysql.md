# MySQL Guide

`MySQLClient` is the direct MySQL client for LinkedQL. It gives you full SQL access and transactions over a native MySQL connection, with planned realtime capabilities built on MySQL's binlog.

Use `MySQLClient` when your application talks directly to MySQL.

> `MySQLClient` uses the `mysql2` connector under the hood and accepts all the existing constructor options.

---

## Setup

```js
import { MySQLClient } from '@linked-db/linked-ql/mysql';

const db = new MySQLClient({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydb',
  poolMode: false,
});

await db.connect();

const result = await db.query('SELECT 1 AS `result`');
console.log(result.rows);
// [{ result: 1 }]

await db.disconnect();
```

---

## Connection Mode

By default, `MySQLClient` runs on a single PostgreSQL connection.

You can opt into connection pooling by enabling `poolMode`:

```js
const db = new MySQLClient({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydb',
  poolMode: true,
});
```

In `poolMode`, `MySQLClient` uses a connection pool to handle concurrent queries more efficiently.

After initializing the instance via `db.connect()`, subsequent `db.connect()` calls simply return a checked-out client.

This lets you explicitly check out a connection for session-sensitive work:

```js
const client = await db.connect();
// ... run session-bound queries
client.release();
```

This is useful for transactions or workflows that require a stable connection.

---

## Realtime Setup

LinkedQL is designed to integrate with MySQL's binary log (binlog) for realtime capabilities.

To make this possible, binary logging must be enabled on the MySQL server.

At minimum, set in your database config file:

```conf
log_bin = ON
```

For correct change capture, row-based logging is recommended:

```conf
binlog_format = ROW
```

Refer to the official MySQL documentation for enabling and configuring binary logging.

Once binary logging is available, LinkedQL can build on top of it for realtime features.

> [!NOTE]
> Realtime capabilities, specifically live queries and commit stream subscriptions, are not yet available on MySQL. Support for these features is planned and will build on the binlog-based foundation.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| how this fits into larger app architectures | [Integration Patterns](/guides/integration-patterns) |
| the common API contract | [API](/api) |
