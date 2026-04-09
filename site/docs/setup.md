# Setup Guides

LinkedQL can run in three common shapes, depending on your database model or application architecture.

## Know Your Model

| Model | Use it when | The shape |
| :-- | :-- | :-- |
| Direct database querying | your app can connect to the database directly | app → database (e.g. `PGClient`, `MySQLClient`, `MariaDBClient`) |
| Cross-runtime querying | your app runs in the browser/edge and needs to query a remote database | app → `EdgeClient` → database |
| Local-first querying | you want the database inside the app | app → local database (`FlashQL`) |

You can also combine models. For example, you can run a local FlashQL instance that is itself backed by an upstream database like PostgreSQL. This is covered in detail in the [Sync Patterns](/flashql/sync-patterns) page.

This page, however, takes you through how the individual clients work.

**Table of Contents**

[[toc]]

## Clients and Import Paths

Each model above maps to one or more clients:

| **Client**          | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| PGClient            | `@linked-db/linked-ql/postgres`      | [PostgreSQL](#postgresql) |
| MySQLClient         | `@linked-db/linked-ql/mysql`   | [MySQL](#mysql)           |
| MariaDBClient       | `@linked-db/linked-ql/mariadb` | [MariaDB](#mariadb)       |
| FlashQL             | `@linked-db/linked-ql/flashql`   | [FlashQL](#flashql)       |
| EdgeClient          | `@linked-db/linked-ql/edge`    | [Edge / Browser](#edgeclient)   |
| EdgeWorker          | `@linked-db/linked-ql/edge-worker` | [Edge Worker](#edgeworker) |

All setups expose the same [Query Interface](/docs/query-api):

- `db.query()`
- `db.stream()`
- `db.transaction()`
- `db.query({ live: true })`
- `db.wal.subscribe()`

What determines the specific clients you use is your database model or application architecture.

## Dialect-Agnostic Clients

While the mainstream database client family – `PGClient`, `MySQLClient`, `MariaDBClient` – speaks a specific dialect,
FlashQL and the Edge runtime client can talk over either `postgres` or `mysql`.

```js
const db = new FlashQL({ dialect: 'postgres' });
```

```js
EdgeWorker.webWorker({ db: new FlashQL({ dialect: 'mysql' }) });
```

```js
EdgeWorker.webWorker({ db: new PGClient() });
```

Dialect affects syntax and relational semantics. The rest determines where queries execute and how data moves.

## Enabling Realtime Capabilities

LinkedQL’s realtime capabilities (live queries and WAL subscriptions) depend on the support mode of the underlying database.
For FlashQL and the Edge runtime client, this is automatic. But for the mainstream database family, this works behind a configuration.

On a PostgreSQL database, for example, live queries and subscriptions require that *logical replication* be enabled on the database.
Similar requirements apply to the rest of the mainstream database family: MySQL and MariaDB.

While the database-specific switch may vary, the API shape your application sees remains:

```js
await db.query('SELECT * FROM users', { live: true });
```

```js
await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

Realtime setup requirements are detailed with the relevant sections below.

## The Mainstream Database Family

> `PGClient`, `MySQLClient`, `MariaDBClient`

These clients run over a native database connection.

---

### PostgreSQL

`PGClient` is the direct PostgreSQL client for LinkedQL. It gives you full SQL access, transactions, and realtime capabilities over a native PostgreSQL connection.

Use `PGClient` when your application talks directly to PostgreSQL.

> `PGClient` uses the `node-postgres` connector under the hood and accepts all the existing constructor options.

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

#### Realtime Setup

LinkedQL uses PostgreSQL’s logical replication to power live queries and commit stream subscriptions. This requires logical replication to be enabled on the PostgreSQL instance.

At minimum, set in your database config file:

```conf
wal_level = logical
```

Depending on your setup, you may also need:

```conf
max_replication_slots = 10
max_wal_senders = 10
```

Refer to the [official PostgreSQL documentation](https://www.postgresql.org/docs/current/logical-replication-config.html) for enabling logical replication.

> Restart PostgreSQL after changing these settings.

Once enabled, LinkedQL handles the rest automatically:

* creates a replication slot if it does not already exist
* creates a publication if it does not already exist
* subscribes to and decodes the WAL stream

The replication slot name and publication name that LinkedQL uses by default are:

| Setting          | Default                        |
| :--------------- | :----------------------------- |
| Replication slot | `linkedql_default_slot` (ephemeral by default) |
| Publication      | `linkedql_default_publication` |

Note that by default, when LinkedQL creates a publication, it creates it for all tables.

You can override these defaults if needed via constructor options:

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `walSlotName` | `string` | `'linkedql_default_slot'` | logical replication slot name |
| `walSlotPersistence` | `0 \| 1` | `0` | whether the slot should be ephemeral or persistent |
| `pgPublications` | `string \| string[]` | `'linkedql_default_publication'` | publication(s) used for change streaming |

Example:

```js
const db = new PGClient({
  walSlotName: 'my_slot',
  walSlotPersistence: 1, // persist slot across restarts
  pgPublications: 'my_publication',
});
```

This is useful when:

* you manage replication slots manually
* you need persistent slots
* you want to integrate with an existing replication setup

> [!TIP]
> LinkedQL consumes PostgreSQL’s WAL using the `pgoutput` plugin—the same mechanism PostgreSQL uses for native logical replication.

---

### MySQL

`MySQLClient` is the direct MySQL client for LinkedQL. It gives you full SQL access and transactions over a native MySQL connection, with planned realtime capabilities built on MySQL’s binlog.

Use `MySQLClient` when your application talks directly to MySQL.

> `MySQLClient` uses the `mysql2` connector under the hood and accepts all the existing constructor options.

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

#### Realtime Setup

LinkedQL is designed to integrate with MySQL’s binary log (binlog) for realtime capabilities.

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

> [NOTE]
> Realtime capabilities (live queries and commit stream subscriptions) are not yet available on MySQL.
> Support for these features is planned and will build on the binlog-based foundation.

---

### MariaDB

`MariaDBClient` is the direct MariaDB client for LinkedQL. It gives you full SQL access and transactions over a native MariaDB connection, with planned realtime capabilities built on MariaDB’s binlog.

Use `MariaDBClient` when your application talks directly to MariaDB.

> `MariaDBClient` uses the native `mariadb` connector under the hood and accepts all the existing constructor options.

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

#### Notes

- Unlike the others, `MariaDBClient` always runs on a pool connection
- in every other way, though, it follows the same common contract as the other clients

#### Realtime Setup

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

> [NOTE]
> Realtime capabilities (live queries and commit stream subscriptions) are not yet available on MariaDB.
> Support for these features is planned and will build on the binlog-based foundation.

---

## The Edge Family

> `EdgeClient`, `EdgeWorker`

The Edge family lets your application use the full LinkedQL client contract from environments that cannot connect to a database directly—such as the browser or edge runtimes.

Instead of designing custom APIs, you run a LinkedQL-capable client behind a transport boundary and access it remotely.

From your application’s point of view, nothing changes:

- you still call `db.query()`
- you still use transactions, streams, and live queries

What changes is where those operations execute.

---

### `EdgeClient`

`EdgeClient` is the application-facing LinkedQL client.

It forwards all operations to an `EdgeWorker` over a transport:

- HTTP
- `Worker` / `SharedWorker` ports

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  type: 'http',
  url: 'https://api.example.com/db',
  dialect: 'postgres',
});

const result = await db.query('SELECT id, name FROM public.users ORDER BY id');
console.log(result.rows);
```

The above talks to an `EdgeWorker` over HTTP.

To run in a web worker or shared worker, change the `type` and `url` parameters:

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  type: 'worker', // or shared_worker
  url: '/db.worker.js',
  dialect: 'postgres',
});
```

---

### `EdgeWorker`

`EdgeWorker` is the server- or worker-side runtime that exposes a LinkedQL instance over a transport.

It typically wraps another LinkedQL instance – `PGClient`, `FlashQL`, etc. – and makes it remotely accessible to `EdgeClient`:

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
  type: 'http',
  db: pg,
});
```

The above exposes `pg` over HTTP.

The `type` is implicit when bootstrapped via its "http" factory method:

```js
const worker = EdgeWorker.http({ db: pg });
```

To run in a web worker or shared worker, change the `type` parameter.
But also, `EdgeWorker` is able to run autonomously when bootstrapped via its "worker" factory methods:

```js
EdgeWorker.webWorker({ db: pg });
EdgeWorker.sharedWorker({ db: pg });
```

#### Handling Protocol Calls

In a web worker or shared worker environment, `EdgeWorker` has a straight-forward way to decode and encode protocol calls. The situation, however, is a bit different in a HTTP server:

> the request/response primitives and lifecycle semantics cannot be assumed.

You must therefore explicitly pass in the parsed request payload and send back the worker's response. Both ends understand the payload contract they exchange.

```js
// Now the handler (at "/api/db") that exposes the worker:
export async function POST(request) {

  // EdgeClient encodes operations as (op, args)
  const op = new URL(request.url).searchParams.get('op');
  const args = await request.json();

  // Delegate execution to the upstream client
  const result = await worker.handle(op, args);

  return Response.json(result ?? {});
}
```

Note that, above, `request` is assumed to be a standard [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object.

The above in a [Webflo](https://github.com/webqit/webflo) application would look like the following:

<details>
<summary>Show code</summary>

```js
export async function POST(event, next) {
    //await event.user.signIn();
    if (next.stepname) return await next();

    const op = event.url.query.op;
    const args = await event.request.json();


    return await worker.handle(op, args, event.client, () => {
        event.waitUntil(new Promise(() => { }));
    }) || {}; // Always return something to prevent being a 404
}
```

Notice the `event.client` argument. It is the `port` parameter used by the edge worker for port-based communication with the edge client.

A callback is also passed in to handle mode switch on the specific request. It is called when `EdgeWorker` needs to extend the request lifecycle to handle interactive, possibly-long-lived sessions. The Webflo backend uses that to hold down the event's lifecycle from terminating.

Webflo's interactive-first architecture provides the most powerful way to run `EdgeWorker` over HTTP. To acheive the same over an otherwise ordinary node.js or express backend, see the [node-live-response](https://github.com/webqit/node-live-response) package.

</details>

#### What Gets Forwarded

`EdgeWorker` forwards the full LinkedQL contract:

* queries
* streams
* transactions
* live queries
* WAL subscriptions

*Realtime* flows through the same channel, so updates produced on the server are streamed back to the client.

This is why `EdgeClient` can feel surprisingly "local" even when the execution site is remote.

#### Realtime Setup

Realtime features—live queries and WAL subscriptions—don't require any configuration at the `EdgeClient` or `EdgeWorker` level. They work transparently over the Edge transport.

From the application’s point of view, the contract remains:

```js
await db.query('SELECT * FROM users', { live: true });

await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

but the queries and subscriptions actually happen at the upstream database level.

This also means that realtime support depends on the capabilities of the **upstream database** behind `EdgeWorker`.

For a recap of that:

* `PGClient` → requires logical replication (see PostgreSQL setup above)
* `FlashQL` → works out of the box (see below)
* `MySQLClient` / `MariaDBClient` → not yet supported (planned)

#### Transport Level Considerations

For realtime to work correctly across the transport layer, the transport must support **long-lived / interactive requests**.

* This is automatically true in a **Worker / SharedWorker** runtime
* For **HTTP** servers, this requires the server to support live, interactive request sessions

→ See the [protocol](#handling-protocol-calls) section above for handling interactive requests.

---

## The Local Runtime

> `FlashQL`

---

### `FlashQL`

Unlike the other clients, FlashQL is not a connector to an external database. It is the database itself – a **full SQL runtime** that runs in the same process as your app.

Use `FlashQL` when you want the database to run **inside your application**—in Node.js, the browser, a worker, or an edge runtime.

→ See the [FlashQL Overview](/flashql) for architecture and capabilities.

#### Basic Setup

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

const result = await db.query('SELECT 1::text AS result');
console.log(result.rows);

await db.disconnect();
```

#### Configuration Shape

FlashQL is configured entirely at construction time and all parameters are optional:

| Option              | Type                    | Default      | Purpose                      |
| :------------------ | :---------------------- | :----------- | :--------------------------- |
| `dialect`           | `'postgres' \| 'mysql'` | `'postgres'` | default SQL dialect          |
| `keyval`            | `Keyval`                | `null`       | enables persistence          |
| `getUpstreamClient` | `(origin) => client`    | `null`       | resolves upstream sources    |
| `versionStop`       | `string \| object`      | `null`       | boot at a historical point   |
| `overwriteForward`  | `boolean`               | `false`      | allow branching from history |
| `autoSync`          | `boolean`               | `true`       | run sync on connect          |

Example:

```js
const keyval = new IndexedDBKV({ path: ['my-app'] });
const upstream = new EdgeClient({ url: remoteUrl });

const db = new FlashQL({
  dialect: 'mysql',
  keyval,
  getUpstreamClient: () => upstream,
});
```

#### Persistence

FlashQL supports persistence via the `keyval` parameter.

→ See [Persistence](/flashql#persistence)

#### Upstream Connections

FlashQL connects to external databases via the `getUpstreamClient()` callback.

→ See [Federation, Materialization, and Sync](/flashql/foreign-io)

#### Realtime and Sync

Realtime queries, WAL subscriptions, and sync are **built into the runtime**. No database-level setup is required.

→ See:

* [Live Queries](/capabilities/live-queries)
* [Changefeeds](/capabilities/changefeeds)
* [The Sync API](/flashql/sync-api)
