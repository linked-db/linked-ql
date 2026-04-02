# Dialects & Clients

LinkedQL ships with three client families:

- direct database clients
- edge transport clients
- the local runtime in FlashQL

All of them participate in the common application contract documented in [Query Interface](/docs/query-api).

## At a glance

| Family | Use it when | Main entries |
| :-- | :-- | :-- |
| Direct database clients | your application talks directly to the database | `PGClient`, `MySQLClient`, `MariaDBClient` |
| Edge transport clients | the client cannot connect to the database directly | `EdgeClient`, `EdgeWorker` |
| Local runtime | the database should run inside the app, worker, or edge process | `FlashQL` |

The sections below walk through each family in that order.

## PostgreSQL

Use `PGClient` when your application talks directly to PostgreSQL.

```js
import { PGClient } from '@linked-db/linked-ql/postgres';

const db = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
  poolMode: false,
});

await db.connect();

const result = await db.query('SELECT 1::text AS result');
console.log(result.rows);
// [{ result: '1' }]

await db.disconnect();
```

### Notes

- `PGClient` is the strongest mainstream-database integration path today
- PostgreSQL is also the dialect with the broadest tested query coverage across the project

### Realtime notes

LinkedQL's live-query story over PostgreSQL depends on WAL/logical replication setup.

Relevant constructor options for `PGClient` include:

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `walSlotName` | `string` | `'linkedql_default_slot'` | logical replication slot name |
| `walSlotPersistence` | `0 \| 1` | `0` | whether the slot should be ephemeral or persistent |
| `pgPublications` | `string \| string[]` | `'linkedql_default_publication'` | publication(s) used for change streaming |

## MySQL

Use `MySQLClient` when your application talks directly to MySQL.

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

### Notes

- `MySQLClient` uses the `mysql2` connector under the hood
- dialect normalization exists, but the deepest execution/test emphasis in the project still leans PostgreSQL-first

## MariaDB

Use `MariaDBClient` when your application talks directly to MariaDB.

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

### Notes

- `MariaDBClient` always runs on a pool
- it follows the same common contract as the other clients

## EdgeClient

Use `EdgeClient` when your app cannot or should not connect directly to the database, but you still want the LinkedQL contract remotely.

`EdgeClient` talks to an `EdgeWorker` over:

- HTTP
- `Worker` ports
- `SharedWorker` ports

### HTTP transport example

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  url: 'https://api.example.com/db',
  type: 'http',
  dialect: 'postgres',
});

const result = await db.query('SELECT id, name FROM public.users ORDER BY id');
console.log(result.rows);
```

### Worker transport example

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  url: '/db.worker.js',
  type: 'worker',
  dialect: 'postgres',
});

const result = await db.query('SELECT id, name FROM public.users ORDER BY id');
console.log(result.rows);
```

### Why `EdgeClient` exists

It gives you a clean middle shape between:

- "direct DB client in the app"
- and "rewrite everything around custom API endpoints"

Your app still speaks the LinkedQL client contract. The actual database client lives behind the transport boundary.

## EdgeWorker

`EdgeWorker` is the server/worker-side runtime that exposes a LinkedQL-capable client over HTTP or worker ports.

It usually wraps one of:

- `PGClient`
- `FlashQL`
- another LinkedQL-capable client

### Example: HTTP worker in front of PostgreSQL

```js
import { PGClient } from '@linked-db/linked-ql/postgres';
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const pg = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
});

await pg.connect();

const worker = new EdgeWorker({
  client: pg,
  type: 'http',
});

// Then route incoming requests to worker.handle(op, args, port?)
```

### Example: web worker in front of FlashQL

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const local = new FlashQL();
await local.connect();

EdgeWorker.webWorker({ client: local });
```

### What EdgeWorker forwards

It routes and resolves:

- queries
- streams
- explicit transactions
- live queries
- WAL subscriptions

That is why `EdgeClient` can feel surprisingly "local" even when the execution site is remote.

## FlashQL

Use `FlashQL` when you want the database runtime inside your application process, worker, browser tab, or edge function.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL({ dialect: 'postgres' });
await db.connect();

const pgResult = await db.query('SELECT 1::text AS result');
console.log(pgResult.rows);

const myResult = await db.query('SELECT 1 AS `result`', { dialect: 'mysql' });
console.log(myResult.rows);

await db.disconnect();
```

### Key options

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `dialect` | `'postgres' \| 'mysql'` | `'postgres'` | default parse/execute dialect |
| `keyval` | key-value backend | `null` | persistence backend for storage/WAL/sync state |
| `getUpstreamClient` | `(origin) => client` | `null` | factory for upstream clients used by foreign namespaces |
| `versionStop` | `string \| object` | `null` | boot the store at a chosen relation-version boundary |
| `overwriteForward` | `boolean` | `false` | allow writable continuation from a historical boot point |
| `autoSync` | `boolean` | `true` | automatically run `db.sync.sync()` on connect when persistent storage is present |

### Why FlashQL is different

FlashQL is not just another client wrapper. It is:

- the local engine
- the local persistence layer
- the place where federation, materialization, realtime mirroring, and sync come together
