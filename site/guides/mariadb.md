# MariaDB Guide

`MariaDBClient` is the direct MariaDB client for LinkedQL. It gives you full SQL access and transactions over a native MariaDB connection, with planned realtime capabilities built on MariaDB's binlog.

Use `MariaDBClient` when your application talks directly to MariaDB.

> `MariaDBClient` uses the native `mariadb` connector under the hood and accepts all the existing constructor options.

---

## Setup

```js
import { MariaDBClient } from '@linked-db/linked-ql/mariadb';

const db = new MariaDBClient({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydb',
});

await db.connect();

const result = await db.query('SELECT 1 AS `result`');
console.log(result.rows);
// [{ result: 1 }]

await db.disconnect();
```

---

## Connection Mode

`MariaDBClient` always runs on a pool-backed connection model.

That means the MariaDB guide differs slightly from PostgreSQL and MySQL: there is no `poolMode` switch here because pooling is the default operating model of the client.

In every other way, however, `MariaDBClient` follows the same common contract as the other clients. For example, calling `db.connect()` returns a checked-out client for use.

---

## Realtime Setup

As in the MySQL setup, LinkedQL is designed to integrate with MariaDB's binary log (binlog) for realtime capabilities.

To make this possible, binary logging must be enabled on the MariaDB server.

At minimum, set in your database config file:

```conf
log_bin = ON
```

For correct change capture, row-based logging is recommended:

```conf
binlog_format = ROW
```

Refer to the official MariaDB documentation for enabling and configuring binary logging.

Once binary logging is available, LinkedQL can build on top of it for realtime features.

> [!NOTE]
> Realtime capabilities, specifically live queries and commit stream subscriptions, are not yet available on MariaDB. Support for these features is planned and will build on the binlog-based foundation.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the common application-facing methods | [API](/api/) |
| how this fits into larger app architectures | [Integration Patterns](/guides/integration-patterns) |
