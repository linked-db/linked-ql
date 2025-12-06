# Dialects & Clients

LinkedQL ships with clients for each SQL dialect supported.

For **PostgreSQL**, **MySQL**, and **MariaDB**, LinkedQL integrates directly with the corresponding native driver.

## PostgreSQL

Use as a drop-in replacement for [`node-postgres`](https://www.npmjs.com/package/pg).

```js
import { PGClient } from '@linked-db/linked-ql/postgres';

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

### Client Options

`PGClient` supports **all options supported by `node-postgres`**, including the following.

| Option     | Type      | Default | Description                                                  |
| :--------- | :-------- | :------ | :----------------------------------------------------------- |
| `poolMode` | `boolean` | `false` | When `true`, uses `pg.Pool`; when `false`, uses `pg.Client`. |

### Realtime Setup

LinkedQL’s realtime behavior can be tuned via:

| Option               | Type                 | Default                          | Description                                                                                                                                                        |
| :------------------- | :------------------- | :------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walSlotName`        | `string`             | `'linkedql_default_slot'`        | Logical replication slot name used for change streaming.                                                                                                           |
| `walSlotPersistence` | `0 \| 1`.            | `0`                              | Slot lifecycle policy:<br>`0` — ephemeral, droped by PostgreSQL at end of session;<br>`1` — persistent, dropped/managed by you.                                    |
| `pgPublications`     | `string \| string[]` | `'linkedql_default_publication'` | Publication name(s) to subscribe to for changes.                                                                                                                   |

::: warning Logical Replication Required
To enable **Live Queries**, ensure PostgreSQL [logical replication](https://www.postgresql.org/docs/current/view-pg-replication-slots.html) is enabled and, optionally, a publication is configured.
:::

## MySQL

Use in place of [`mysql2`](https://www.npmjs.com/package/mysql2).

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

const res = await client.query('SELECT 1 AS \`result\``);
console.log(res.rows); // [{ result: 1 }]

await client.disconnect();
```

### Client Options

`MySQLClient` supports **all options supported by `mysql2`**, including the following.

| Option     | Type      | Default | Description                                                                            |
| :--------- | :-------- | :------ | :------------------------------------------------------------------------------------- |
| `poolMode` | `boolean` | `false` | When `true`, uses `mysql.createPool()`; when `false`, uses `mysql.createConnection()`. |

### Realtime Setup

_Live Queries for MySQL **coming soon**._

## MariaDB

Use in place of [`mariadb`](https://www.npmjs.com/package/mariadb`)/[`mysql2`](https://www.npmjs.com/package/mysql2).

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

const res = await client.query('SELECT 1 AS \`result\``);
console.log(res.rows); // [{ result: 1 }]

await client.disconnect();
```

### Client Options

`MariaDBClient` supports **all options supported by `mariadb`**.

::: tip Auto Pooling
MariaDBClient always runs on a connection pool.
:::

### Realtime Setup

_Live Queries for MariaDB **coming soon**._

## FlashQL

Use in place of SQLite, PGLite, and similar. Speaks both MySQL and PostgreSQL.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const client = new FlashQL();
await client.connect();

// PostgreSQL-style syntax (default)
const pgRes = await client.query('SELECT 1::text AS result');
console.log(pgRes.rows); // [{ result: '1' }]

// MySQL-style syntax (explicit dialect)
const myRes = await client.query('SELECT 1 AS `result`', { dialect: 'mysql' });
console.log(myRes.rows); // [{ result: 1 }]

await client.disconnect();
```

### Client Options

`FlashQL` can be configured via a few options.

| Option    | Type                      | Default        | Description                                                                    |
| :-------- | :------------------------ | :------------- | :----------------------------------------------------------------------------- |
| `dialect` | `'postgresql' \| 'mysql'` | `'postgresql'` | Default parsing/execution dialect.                                             |
| `storage` | `FlashQLStorage`    | `undefined`    | (Coming soon) Storage target or adapter for persistent storage.                         |

### Realtime Setup

_Realtime capabilities are **built in**. FlashQL maintains its own change events internally; no external replication setup is required._
