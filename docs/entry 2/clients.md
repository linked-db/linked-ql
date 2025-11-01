---
title: "Clients and Dialects"
description: "The LinkedQL clients and dialects"
permalink: /entry/clients/
nav_order: 4
layout: page
---

# Dialects & Clients

LinkedQL ships with clients for each major SQL dialect.

Each LinkedQL client extends its respective native connector and accepts the same initialization options.
The PostgreSQL, MySQL, and MariaDB clients integrate directly with their native drivers, while **FlashQL** provides an in-memory SQL engine that speaks both dialects.

---

## `1.1 |` PostgreSQL

Use as a drop-in replacement for [`node-postgres`](https://www.npmjs.com/package/pg).<br>
Speaks native **PostgreSQL**.

```js
import { PGClient } from '@linked-db/linked-ql/pg';

const client = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
  poolMode: false // defaults to pg.Client
});
await client.connect();

const res = await client.query('SELECT 1::text AS result');
console.log(res.rows); // [{ result: '1' }]

await client.disconnect();
```

### `1.1.1 |` Client Options

`PGClient` accepts all options supported by `node-postgres`.

Additional options:

* **`poolMode`** (*Default*: `false`) — whether to connect over `pg.Pool` or `pg.Client`.

### `1.1.2 |` Realtime Setup

To enable **live queries**, ensure [logical replication](https://www.postgresql.org/docs/current/view-pg-replication-slots.html) is enabled on your database.

Optionally specify the following to adapt LinkedQL to your setup:

* **`walSlotName`** — (*Default*: `'linkedql_default_slot'`) replication slot name.
* **`walSlotPersistence`** — slot lifecycle management:<br>
  `0` = ephemeral, DB-managed · `1` = ephemeral, LinkedQL-managed · `2` = persistent, external management implied.
* **`pgPublications`** — (*Default*: `'linkedql_default_publication'`) publication name(s) to listen on.

---

## `1.2 |` MySQL

Use in place of [`mysql2`](https://www.npmjs.com/package/mysql2).
Speaks native **MySQL**.

```js
import { MySQLClient } from '@linked-db/linked-ql/mysql';

const client = new MySQLClient({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydb',
  poolMode: false // defaults to mysql.createConnection()
});
await client.connect();

const res = await client.query('SELECT 1 AS `result`');
console.log(res.rows); // [{ result: 1 }]

await client.disconnect();
```

### `1.2.1 |` Client Options

`MySQLClient` accepts all connection options supported by `mysql2`.

Additional options:

* **`poolMode`** (*Default*: `false`) — whether to connect over `mysql.createPool()` or `mysql.createConnection()`.

### `1.2.2 |` Realtime Setup

Realtime capabilities for MySQL are **coming soon**.

---

## `1.3 |` MariaDB

Use in place of [`mariadb`](https://www.npmjs.com/package/mariadb`).<br>
Speaks native **MariaDB / MySQL**.

```js
import { MariaDBClient } from '@linked-db/linked-ql/mariadb';

const client = new MariaDBClient({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydb'
});
await client.connect();

const res = await client.query('SELECT 1 AS `result`');
console.log(res.rows); // [{ result: 1 }]

await client.disconnect();
```

### `1.3.1 |` Client Options

`MariaDBClient` accepts all connection options supported by the native `mariadb` driver.<br>
It always runs on a connection pool.

### `1.3.2 |` Realtime Setup

Realtime support for MariaDB is **coming soon**.

---

## `1.4 |` FlashQL

Use as an in-memory alternative to [`SQLite`](https://sqlite.org/) or [`PGLite`](https://pglite.dev/).
Speaks both **PostgreSQL** and **MySQL** dialects.

```js
import { FlashClient } from '@linked-db/linked-ql/flash';

const client = new FlashClient();
await client.connect();

// PostgreSQL syntax (default dialect)
const pgRes = await client.query('SELECT 1::text AS result');
console.log(pgRes.rows); // [{ result: '1' }]

// MySQL syntax (explicit dialect)
const myRes = await client.query('SELECT 1 AS `result`', { dialect: 'mysql' });
console.log(myRes.rows); // [{ result: 1 }]

await client.disconnect();
```

### `1.4.1 |` Realtime Setup

Realtime capabilities are built in.
No configuration required — FlashQL automatically emits and processes change events internally.
