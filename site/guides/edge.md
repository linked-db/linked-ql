# Edge Guide

The LinkedQL Edge protocol lets you run LinkedQL as if the database were local, even when it lives across a network boundary – server, worker, or edge runtime.

Instead of building APIs around your database, you expose the database contract itself remotely.

From your application's point of view, nothing changes:

- you still call `db.query()`
- you still use transactions, streams, and live queries
- your data layer does not split into "client vs server logic"

What changes is where those operations execute.

At a high level, the model looks like this:

`EdgeClient` <-> transport <-> `EdgeWorker` -> LinkedQL (`PGClient`, `FlashQL`, etc.)

---

## `EdgeClient`

`EdgeClient` is the application-facing LinkedQL client.

It forwards the full LinkedQL protocol to an `EdgeWorker` over a transport. Depending on the upstream/downstream boundary, the transport can be one of:

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
  type: 'worker',
  url: '/db.worker.js',
  dialect: 'postgres',
});
```

### Configuration

The most important `EdgeClient` configuration knobs are the ones that define the boundary it crosses and how it speaks across it.

| Option | Meaning |
| :-- | :-- |
| `type` | transport type such as `http`, `worker`, or `shared_worker` |
| `url` | the endpoint or worker entry used to reach the upstream runtime |
| `dialect` | the SQL dialect the client should parse and assume |
| `portBasedStreaming` | when `type` is `http`, whether streaming should happen over a port-based channel rather than a streamed HTTP body |

Note on `portBasedStreaming`:

+ only applicable when `type` is `http`
+ `true` by default – meaning on calling `EdgeClient.stream(query)`, rows are delivered over a communication port rather than over native HTTP response streams

---

## `EdgeWorker`

`EdgeWorker` is the server- or worker-side runtime that exposes a LinkedQL instance over a transport.

It typically wraps another LinkedQL instance, `PGClient`, `FlashQL`, and so on, and makes it accessible to `EdgeClient` across a transport boundary:

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

In your `/api/db` route, or similar, you handle the requests from `EdgeClient`:

```js
export async function POST(request) {
  const event = { request };
  const result = await httpEdge.handle(event);
  return result;
}
```

In a web worker or shared worker, `EdgeWorker` is able to run autonomously:

```js
const webWorkerEdge = EdgeWorker.webWorker({ db });
const sharedWorkerEdge = EdgeWorker.sharedWorker({ db });
```

```js
webWorkerEdge.runIn(self);
```

## What Gets Forwarded

`EdgeWorker` forwards the full LinkedQL contract:

- queries
- streams
- transactions
- live queries
- WAL subscriptions

This is why `EdgeClient` can feel fully local even when execution is remote. The LinkedQL contract is preserved end-to-end, not translated into an intermediate API.

---

## Realtime Notes

Realtime features, live queries and WAL subscriptions, do not require any configuration at the `EdgeClient` or `EdgeWorker` level. They work transparently over the Edge transport.

From the application's point of view, the contract remains:

```js
await db.query('SELECT * FROM users', { live: true });

await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

But the queries and subscriptions actually happen at the upstream database level.

This also means that realtime support depends on the capabilities of the upstream database behind `EdgeWorker`.

For a recap of that:

- `PGClient` requires logical replication to be enabled
- `FlashQL` works out of the box
- `MySQLClient` and `MariaDBClient` are not yet supported for live queries and changefeeds. But those would require Binary Loggin (Binlog) enabled

---

## Transport Level Considerations

For realtime to work correctly across the transport layer, the backend must expose an interactive communication capability.

- This is automatically available in `Worker` and `SharedWorker` runtimes
- For HTTP servers, this depends on whether the backend can provide that interactive channel exposed as `event.client`

That transport/runtime capability determines how much of the LinkedQL contract can be projected across the boundary. This is what is covered below.

---

## Host Runtime Event Shape

In a web worker or shared worker environment, `EdgeWorker` has a straightforward way to decode and encode protocol calls. The situation is different in an HTTP context.

HTTP does not provide a persistent channel. This means:

- each request is stateless by default
- live queries and streams cannot be supported unless the backend provides a port-based communication channel
- request lifecycles may terminate unless explicitly extended

These protocol-level constraints are handled in a layered approach:

- the more features your runtime can provide, the more of the LinkedQL contract you can have across the boundary
- `EdgeWorker.handle(event)` accepts an event object that reflects exactly the capabilities of the host runtime

The event object's standard shape is:

```typescript
interface HostHttpRequestEvent {
  request: Request;
  client?: MessagePortPlus;
}
```

For backends that have a *managed* request lifecycle model and/or response path, `EdgeWorker` accepts an extended `HostHttpRequestEvent` interface:

```typescript
interface HostHttpRequestEvent {
  request: Request;
  client?: MessagePortPlus;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (response: Response) => void;
}
```

Each option is documented below.

### `event.request`

At minimum, `EdgeWorker` expects:

- `event.request`: a standard [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object

With only `event.request`, Level 1 LinkedQL capabilities are available across the transport, meaning operations that can fully complete within a single HTTP exchange:

- `db.query()`
- request-scoped `db.stream()`

This excludes:

- live queries
- bidirectional or long-lived interactions

### `event.client`

(**optional**) This is for backends that support interactive, bidirectional communication with the client. When present, `EdgeWorker` uses it to fulfill stateful parts of the LinkedQL protocol such as live queries.

The expected contract is:

- `event.client`: a `MessagePortPlus` interface that provides a port-based communication channel

This upgrades the interaction from a bounded request into a stateful session.

This enables Level 2 LinkedQL capabilities:

- live queries
- cursor-based streaming
- long-lived subscriptions

### `event.waitUntil`

(**optional**) This is for backends that support extending the lifecycle of a request beyond the initial response.

The expected contract is:

- `event.waitUntil(promise)`: a function that signals ongoing work tied to the request

This adds lifecycle reliability to the stateful parts of the Edge protocol:

- live queries
- long-lived subscriptions
- streaming over `event.client`

### `event.respondWith`

(**optional**) This is for backends that provide explicit control over how HTTP responses are dispatched.

The expected contract is:

- `event.respondWith(result)`: a function for sending a response

This enables:

- direct response emission from `EdgeWorker`
- integration with frameworks that manage response lifecycles
- compatibility with environments where returning a response (`return response`) is not the response model

---

## HTTP Backend Examples

### Node.js

```js
import http from 'node:http';
import { enableLive } from '@webqit/node-live-response';
import { LiveResponse } from '@webqit/fetch-plus';
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
    respondWith: (payload) => response.send(new LiveResponse(payload)),
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

### Express

```js
import http from 'node:http';
import express from 'express';
import { enableLive } from '@webqit/node-live-response';
import { LiveResponse } from '@webqit/fetch-plus';
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';

const app = express();
const worker = EdgeWorker.httpWorker({ db });
const server = http.createServer(app);
const liveMode = enableLive(server);

app.all('/db', liveMode, async (request, response) => {
  const event = {
    request: toStandardRequest(request),
    client: request.port,
    respondWith: (payload) => response.send(new LiveResponse(payload)),
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

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| how Edge composes into full application architectures | [Integration Patterns](/guides/integration-patterns) |
| the common API contract | [Core API](/api) |
