# Setup Guide

LinkedQL can run in three common shapes, depending on your database model or application architecture.

## Know Your Model

| Model | Use it when | The shape |
| :-- | :-- | :-- |
| Direct database querying | your app can connect to the database directly | app → database (e.g. `PGClient`, `MySQLClient`, `MariaDBClient`) |
| Cross-runtime querying | your app runs in the browser/edge and needs to query a remote database | app → `EdgeClient` → database |
| Local-first querying | you want the database inside the app, with optional tie-in to an upstream database | app → local database (`FlashQL`) |

One of these will be your use case after setup. They're fully covered in [LinkedQL Integration Patterns](/docs/integration-patterns)

This page, however, takes you through how to spin up a LinkedQL instance.

**Table of Contents**

[[toc]]

## Clients and Import Paths

Each model above maps to one or more clients:

| **Client**          | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| `PGClient`            | `@linked-db/linked-ql/postgres`      | [PostgreSQL](#postgresql) |
| `MySQLClient`         | `@linked-db/linked-ql/mysql`   | [MySQL](#mysql)           |
| `MariaDBClient`       | `@linked-db/linked-ql/mariadb` | [MariaDB](#mariadb)       |
| `FlashQL`             | `@linked-db/linked-ql/flashql`   | [FlashQL](#flashql)       |
| `EdgeClient`          | `@linked-db/linked-ql/edge`    | [Edge / Browser](#edgeclient)   |
| `EdgeWorker`          | `@linked-db/linked-ql/edge-worker` | [Edge Worker](#edgeworker) |

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

LinkedQL’s realtime capabilities (live queries and WAL subscriptions) depend on the support mode of the underlying database. For FlashQL and the Edge runtime client, this is automatic. But for the mainstream database family, this works behind a configuration.

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

| Client/Model     | Jump to...                     |
| :--------------- | :----------------------------- |
| PostgreSQL       |  [PostgreSQL's Realtime Setup](#realtime-setup)   |
| MySQL            |  [MySQL's Realtime Setup](#realtime-setup-1)      |
| MariaDB          |  [MariaDB's Realtime Setup](#realtime-setup-2)    |
| FlashQL          |  [FlashQL's Realtime Notes](#realtime-notes)      |
| Edge             |  [Edge's Realtime Notes](#realtime-notes-1)       |

---

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

#### Connection Mode

By default, `PGClient` runs on a single PostgreSQL connection.

You can opt into connection pooling by enabling `poolMode`:

```js
const db = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
  poolMode: true,
});
```

In `poolMode`, `PGClient` uses a connection pool (via `node-postgres`) to handle concurrent queries more efficiently.

After initializing the instance via `db.connect()`, subsequent `db.connect()` calls simply return a checked-out client.

This lets you explicitly check out a connection for session-sensitive work:

```js
const client = await db.connect(); // checks out a connection
// ... run session-bound queries
client.release(); // return it when done
```

This is useful for transactions or workflows that require a stable connection.

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

> [!NOTE]
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

> [!NOTE]
> Realtime capabilities (live queries and commit stream subscriptions) are not yet available on MariaDB.
> Support for these features is planned and will build on the binlog-based foundation.

---

## The Local Runtime

> `FlashQL`

---

### FlashQL

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

→ See [Federation, Materialization, and Sync](/flashql/federation-and-sync)

#### Realtime Notes

Realtime queries, WAL subscriptions, and sync are **built into the runtime**. No database-level setup is required.

---

## The Edge Family

> `EdgeClient`, `EdgeWorker`

The Edge family lets you run LinkedQL as if the database were local, even when it lives across a network boundary (server, worker, or edge runtime).

Instead of designing APIs around your database, you expose the database contract itself—remotely.

From your application’s point of view, nothing changes:

- you still call `db.query()`
- you still use transactions, streams, and live queries
- your data layer doesn’t split into “client vs server logic”

What changes is where those operations execute.

At a high level, the model looks like this:

`EdgeClient`  <—transport—>  `EdgeWorker`  →  LinkedQL (`PGClient`, `FlashQL`, etc.)

---

### `EdgeClient`

`EdgeClient` is the application-facing LinkedQL client.

It forwards the full LinkedQL protocol to an EdgeWorker over a transport. Depending on the upstream/downstream boundary, the transport can be one of:

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

It typically wraps another LinkedQL instance – `PGClient`, `FlashQL`, etc. – and makes it accessible to `EdgeClient` across a transport boundary:

```js
import { PGClient } from '@linked-db/linked-ql/postgres';
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const db = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
});

await db.connect();

const httpEdge = EdgeWorker.httpWorker({ db });
```

The above exposes the `db` over HTTP.

In your `/api/db` route, or similar, you'd handle the requests from `EdgeClient`:

```js
// In "/api/db"
export async function POST(request) {
  const event = { request };
  const result = await httpEdge.handle(event);
  return result;
}
```

See [Appendix B – HTTP Backend Examples](#appendix-b--http-backend-examples) for practical node.js, express, and Webflo examples.

In a web worker or shared worker, `EdgeWorker` is able to run autonomously:

```js
const webWorkerEdge = EdgeWorker.webWorker({ db });
const sharedWorkerEdge = EdgeWorker.sharedWorker({ db });
```

```js
// In "./db.worker.js"
webWorkerEdge.runIn(self);
```

### What Gets Forwarded

`EdgeWorker` forwards the full LinkedQL contract:

* queries
* streams
* transactions
* live queries
* WAL subscriptions

This is why `EdgeClient` can feel fully "local" even when execution is remote—the LinkedQL contract is preserved end-to-end, not translated into an intermediate API.

### Realtime Notes

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

### Transport Level Considerations

For realtime to work correctly across the transport layer, the backend must expose an interactive communication capability.

- This is automatically available in **Worker / SharedWorker** runtimes
- For **HTTP** servers, this depends on whether the backend can provide a channel (exposed as `event.client`)

→ See the [Appendix A – Handling Protocol Calls](#appendix-a--handling-protocol-calls) section for how backend capabilities map to protocol support.

---

## See Also

* [Live Queries](/capabilities/live-queries)
* [Changefeeds](/capabilities/changefeeds)
* [The Sync API](/flashql/sync-api)

---

## Appendix A – Handling Protocol Calls

In a web worker or shared worker environment, `EdgeWorker` has a straight-forward way to decode and encode protocol calls. The situation is different in a HTTP context:

+ HTTP does not provide a persistent channel. This means:
+ each request is stateless by default
+ live queries and streams cannot be supported unless the backend provides a port-based communication channel (exposed via `event.client`)
+ request lifecycles may terminate unless explicitly extended

These protocol level constraints are handled in the `EdgeWorker` design **in a layered approach**:

+ the more features your runtime can provide, the more of the LinkedQL contract you can have across the boundary
+ `EdgeWorker.handle(event)` accepts an event object that reflects exactly the capabilities of the host runtime

The expected and optional properties of the event object are covered below – each mapped to the level of functionality they unlock in the `EdgeWorker` protocol.

### `event.request` – Required

At minimum, `EdgeWorker` expects:

- `event.request`: a standard [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object

This establishes a **bounded request/response execution model**.

With only `event.request`, Level 1 LinkedQL capabilities are available across the transport—i.e. operations that can fully complete within a single HTTP exchange.

This includes:

- `db.query()`
- request-scoped `db.stream()`

This excludes:

- live queries
- bidirectional or long-lived interactions

At this level, `EdgeWorker` acts as a stateless execution boundary.

### `event.client` – Optional

This is for backends that support interactive, bidirectional communication with the client. When present, `EdgeWorker` uses it to fulfill stateful parts of the LinkedQL protocol – e.g. live queries.

The expected contract is:

- `event.client`: a `MessagePortPlus` interface that provides a port-based communication channel

This upgrades the interaction from a bounded request into a **stateful session**.

This enables Level 2 LinkedQL capabilities—i.e. operations that extend beyond the initial response:

- live queries
- cursor-based streaming
- long-lived subscriptions

Here, HTTP acts only as the session initiator. The protocol continues over the channel provided by `event.client`.

### `event.waitUntil` – Optional

This is for backends that support extending the lifecycle of a request beyond the initial response. When present, `EdgeWorker` uses it to sustain stateful parts of the LinkedQL protocol across environments with managed lifecycles.

The expected contract is:

- `event.waitUntil(promise)`: a function that signals ongoing work tied to the request

This does not change the interaction model, but ensures that an already established **stateful session** remains active for its intended duration.

This adds lifecycle reliability to the stateful parts of the Edge protocol:

- live queries
- long-lived subscriptions
- streaming over `event.client`

Without this feature, `EdgeWorker` can only hope that the application runtime does not prematurely terminate ongoing live sessions after the initial HTTP response is sent.

### `event.respondWith` – Optional

This is for backends that provide explicit control over how HTTP responses are dispatched. When present, `EdgeWorker` uses it to integrate directly with the host runtime’s response model.

The expected contract is:

- `event.respondWith(response)`: a function for sending a `Response` object

This does not expand the LinkedQL feature set, but changes how responses are delivered.

This enables:

- direct response emission from `EdgeWorker`
- integration with frameworks that manage response lifecycles
- compatibility with environments where returning a `Response` isn't the response model

When absent, `EdgeWorker` returns the corresponding response for the request back to the caller.

---

## Appendix B – HTTP Backend Examples

The same `EdgeWorker` HTTP runtime can be hosted in different backends. What changes is only how each backend surfaces the capabilities that `EdgeWorker` expects on the `event` object.

### Example 1: Node.js

This example shows a pure Node.js backend integration. `node-live-response` is used here to upgrade the Node.js HTTP server with `request.port` (the same client needed by `EdgeWorker`) and `response.send(...)`, and the handler maps those capabilities onto the `event` object passed to `EdgeWorker`.

```js
import http from 'node:http';
import { enableLive } from 'node-live-response';
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const worker = EdgeWorker.httpWorker({ db });
const server = http.createServer(handler);
const liveMode = enableLive(server);

server.listen(3000);

async function handler(request, response) {
  liveMode(request, response);

  const event = {
    request: toStandardRequest(request),
    client: request.port,
    respondWith: (payload) => response.send(payload),
  };

  await worker.handle(event);
}

const toStandardRequest = (request) => {
  return new Request(`http://localhost${request.url}`, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request,
    duplex: 'half',
  });
};
```

### Example 2: Express

This example follows the same pattern in Express. `node-live-response` is installed once on the server, then enabled per route as middleware so the handler receives the same `request.port` and `response.send(...)` capabilities.

```js
import http from 'node:http';
import express from 'express';
import { enableLive } from 'node-live-response';
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const app = express();
const worker = EdgeWorker.httpWorker({ db });
const server = http.createServer(app);
const liveMode = enableLive(server);

app.all('/db', liveMode(), async (request, response) => {
  const event = {
    request: toStandardRequest(request),
    client: request.port,
    respondWith: (payload) => response.send(payload),
  };

  await worker.handle(event);
});

server.listen(3000);

const toStandardRequest = (request) => {
  return new Request(`http://localhost${request.url}`, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request,
    duplex: 'half',
  });
};
```

### Example 3: Webflo

This example is the highest-level integration. [Webflo](https://github.com/webqit/webflo) already exposes `request`, `client`, `waitUntil`, and `respondWith` on its event object, so the route can delegate directly to `EdgeWorker`.

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const worker = EdgeWorker.httpWorker({ db });

export async function POST(event, next) {
  if (next.stepname) return await next();

  await worker.handle(event);
}
```
