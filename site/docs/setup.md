# Dialects & Clients

LinkedQL ships with clients for each SQL dialect supported.

For **PostgreSQL**, **MySQL**, and **MariaDB**, LinkedQL integrates directly with the corresponding native driver.

## PostgreSQL

Use as a drop-in replacement for [`node-postgres`](https://www.npmjs.com/package/pg). Speaks native **PostgreSQL**.

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

`PGClient` can be configured via a few options, including all options supported by `node-postgres`.

| Option     | Type      | Default | Description                                                  |
| :--------- | :-------- | :------ | :----------------------------------------------------------- |
| *(all native options)* | —    | —          | Fully compatible with `node-postgres` driver configuration. |
| `poolMode` | `boolean` | `false` | When `true`, uses `pg.Pool`; when `false`, uses `pg.Client`. |

### Realtime Setup

LinkedQL’s realtime behavior can be tuned via:

| Option               | Type                 | Default                          | Description                                                                                                                                                        |
| :------------------- | :------------------- | :------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walSlotName`        | `string`             | `'linkedql_default_slot'`        | Logical replication slot name used for change streaming.                                                                                                           |
| `walSlotPersistence` | `0 \| 1 \| 2`        | `1`                              | Slot lifecycle policy:<br>`0` — ephemeral, managed by PostgreSQL;<br>`1` — ephemeral, managed by LinkedQL;<br>`2` — persistent, assumes external/admin management. |
| `pgPublications`     | `string \| string[]` | `'linkedql_default_publication'` | Publication name(s) to subscribe to for changes.                                                                                                                   |

::: warning Logical Replication Required
To enable **Live Queries**, ensure PostgreSQL [logical replication](https://www.postgresql.org/docs/current/view-pg-replication-slots.html) is enabled and, optionally, a publication is configured.
:::

## MySQL

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

const res = await client.query('SELECT 1 AS \`result\``);
console.log(res.rows); // [{ result: 1 }]

await client.disconnect();
```

### Client Options

`MySQLClient` can be configured via a few options, including all options supported by `mysql2`.

| Option     | Type      | Default | Description                                                                            |
| :--------- | :-------- | :------ | :------------------------------------------------------------------------------------- |
| *(all native options)* | —    | —          | Fully compatible with `mysql2` driver configuration. |
| `poolMode` | `boolean` | `false` | When `true`, uses `mysql.createPool()`; when `false`, uses `mysql.createConnection()`. |

### Realtime Setup

_Live Queries for MySQL is **coming soon**.
Current client usage is for standard query execution._

## MariaDB

Use in place of [`mariadb`](https://www.npmjs.com/package/mariadb`).
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

const res = await client.query('SELECT 1 AS \`result\``);
console.log(res.rows); // [{ result: 1 }]

await client.disconnect();
```

### Client Options

`MariaDBClient` can be configured via a few options, including all options supported by `mariadb`.

| Option                 | Type | Default    | Description                                           |
| :--------------------- | :--- | :--------- | :---------------------------------------------------- |
| *(all native options)* | —    | —          | Fully compatible with `mariadb` driver configuration. |

::: tip Auto Pooling
MariaDBClient always runs on a connection pool.
:::

### Realtime Setup

_Live Queries for MariaDB is **coming soon**.
Current client usage is for standard query execution._

## FlashQL

Use as an in-memory alternative to engines like SQLite or PGLite.
Provides an embeddable SQL runtime and supports multiple dialects.

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
