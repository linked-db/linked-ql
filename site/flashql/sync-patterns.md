# Sync Integration Patterns

This page is about the application problem first, and the topology second.

The problem is not really:

> "Which of these boxes talks to which other box?"

The real problem is:

> "How do I keep one coherent database interface while my app crosses runtime boundaries, network boundaries, and offline/online boundaries?"

That is the arc this page follows.

## The Application-Level Story

There are four broad behaviors developers usually want:

1. talk to a database across a runtime or network boundary
2. stream large result sets efficiently across that boundary
3. run live queries across that boundary
4. move from remote-first data access to local-first and offline-first behavior without changing the app's data model

LinkedQL and FlashQL address those behaviors with a small set of building blocks:

- `EdgeClient`
  the transport-facing client your app can call from a browser, edge function, or worker
- `EdgeWorker`
  the server-side or worker-side protocol host that exposes a real LinkedQL-capable database runtime
- `FlashQL`
  the embedded local database runtime that adds local-first storage, federation, materialization, realtime mirroring, and sync

So the right question is not "which topology is best?" in the abstract.

The right question is:

> "What application behavior do I need first?"

From there, the stack shape usually becomes obvious.

## Behavior 1: Remote Database Access Across Boundaries

This is the simplest story.

Your app cannot or should not connect directly to PostgreSQL or MySQL, but you still want to write:

```js
await db.query(...);
await db.stream(...);
await db.transaction(...);
await db.query(..., { live: true });
```

without inventing a custom API layer for every operation.

That is what `EdgeClient -> backend` solves.

## Pattern A: `EdgeClient -> Backend`

This is the remote-first transport story.

Use it when:

- local-first storage is not the main problem yet
- the app mainly needs transport across browser/server, edge/origin, or worker/server boundaries
- you still want the LinkedQL client contract on the calling side

### What It Feels Like in the App

Your app code uses an `EdgeClient`:

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  url: '/api/db',
  type: 'http',
});
```

The calling code still feels like database code:

```js
const result = await db.query(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);
```

The app does not need to learn a custom request format per feature.

### What It Feels Like on the Backend

The backend exposes a real LinkedQL-capable client through `EdgeWorker`.

#### Pure Node.js HTTP Backend

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { PGClient } from '@linked-db/linked-ql/postgres';

const upstream = new PGClient({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await upstream.connect();

const worker = new EdgeWorker({ db: upstream, type: 'http' });

export async function POST(request) {
  const op = new URL(request.url).searchParams.get('op');
  const args = await request.json();
  const result = await worker.handle(op, args);
  return Response.json(result ?? {});
}
```

### What Is Actually Happening in That HTTP Cycle

Each request carries a LinkedQL protocol operation such as:

- `query`
- `stream`
- `transaction:begin`
- `transaction:commit`
- `wal:subscribe`
- `sync:sync`

The sequence is:

1. `EdgeClient` turns a database method call into `(op, args)`
2. your route extracts `op` and `args`
3. `worker.handle(op, args, ...)` dispatches into the real database client
4. the result is returned in the same general shape the caller expects

That is why the caller still feels like it is talking to a database client rather than a hand-built REST API.

## HTTP as a Transport Story

HTTP matters because it is the broadest transport boundary:

- browser to backend
- edge function to origin
- server to server

It is also the transport with the most natural support for:

- streamed bodies
- ordinary request/response semantics
- generic web payloads such as blobs and binary uploads

That last point matters in real apps. If the same backend boundary may also need to carry images, files, or larger payloads, HTTP is usually the safer transport to organize around.

## Streaming Across HTTP

Once the remote-first transport story exists, the next application behavior is usually:

> "Can I process large results without buffering everything first?"

Yes.

At the app level, it still looks like ordinary `stream()`:

```js
const rows = await db.stream(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);

for await (const row of rows) {
  console.log(row);
}
```

Over HTTP, those rows can travel as a streamed response rather than one fully buffered JSON result.

That is one of the reasons HTTP remains important even if worker transport also exists.

## Live Queries Across HTTP

The next behavior is usually:

> "Can my app observe changing query results across the same boundary?"

Yes, but the backend must be willing to keep the response lifecycle open when a live query is involved.

At the caller:

```js
const result = await db.query(`
  SELECT id, name
  FROM public.users
`, { live: true });
```

The transport/backend responsibility changes here:

- the request can no longer be treated as a one-shot JSON exchange
- the backend must allow a long-lived response path for live updates

That is where frameworks or response libraries built for long-lived responses become especially useful.

## Two Important HTTP Backend Shapes

### Webflo Backend

Webflo is especially strong here because it already has a live-response-first architecture.

The same transport story becomes:

```js
export async function POST(event, next) {
    if (next.stepname) return await next();

    const op = event.url.query.op;
    const args = await event.request.json();

    return await worker.handle(op, args, event.client, () => {
        event.waitUntil(new Promise(() => { }));
    }) || {};
}
```

Why this matters:

- request routing still feels ordinary
- `EdgeWorker` still handles protocol dispatch
- Webflo gives you a natural place to keep live responses open

That makes Webflo one of the strongest backends for live LinkedQL transport.

### `node-live-response` Style Backend

The same story also fits a backend built around long-lived Node.js HTTP responses.

The important idea is not a single framework API. It is the contract:

- parse `op` and `args`
- call `worker.handle(op, args, responseContextOrClientPort, liveModeCallback)`
- keep the response alive when the request enters live mode

So the role of a live-response library is:

- keep the HTTP response open
- let LinkedQL continue forwarding live/query or WAL updates over that response

That turns HTTP from a one-shot request transport into a live data transport without changing the app-facing `db.query(..., { live: true })` shape.

## Behavior 2: Local-First and Offline-First Data

Once remote transport is working, the next application behavior is often:

> "I do not only want to reach the backend. I want a real local database that keeps working offline."

That is where FlashQL enters.

## Pattern B: `FlashQL -> Backend`

This is the direct local-first story.

Use it when:

- the app wants local reads and writes first
- the UI should keep working offline
- origin data should materialize or stay synchronized locally
- writes should later flow back to PostgreSQL or another FlashQL

### What It Feels Like in the App

Your app talks to a local `FlashQL` instance:

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new FlashQL({
  getUpstreamClient: () => new EdgeClient({ url: '/api/db', type: 'http' }),
});

await db.connect();
```

Then you define the origin-backed views that explain what should be mirrored:

```js
await db.query(`
  CREATE REALTIME VIEW public.users AS
  SELECT * FROM public.users
  WITH (
    replication_origin = 'postgres:primary',
    write_policy = 'local_first'
  )
`);
```

### What This Gives You

- local querying
- local writes
- materialization or realtime synchronization
- conflict-aware outbound writes
- one local SQL surface instead of "cache here, fetch there, queue elsewhere"

This is where the system starts feeling application-shaped rather than transport-shaped.

## Federation in This Local-First Shape

Because the local database is still FlashQL, the app can mix:

- local tables
- runtime origin-backed views
- materialized views
- realtime views

inside one query space.

That is a big part of the value: your app queries one relational graph even though the data has different physical homes.

## Materialization in This Shape

Materialization is what turns:

- runtime-only origin state

into:

- local stored state

That matters because it is what makes offline reads real rather than aspirational.

## Realtime in This Shape

Realtime then builds on top of materialization:

- a local copy exists
- inbound origin commits keep that copy hot

So the same local database can mix:

- online-only origin-backed reads
- offline-capable local mirrors
- continuously synchronized mirrors

## Sync in This Shape

Sync is the control plane that keeps those views healthy.

The intended app-level mental model stays small:

- define the views
- let FlashQL do the ordinary automatic work
- on reconnect, call `db.sync.sync()`

That is the one lifecycle step the host app should reliably remember.

## The Real Offline-First Conflict Story

This is where the topology has to serve user expectation.

Imagine a todo app:

- each browser has a local FlashQL
- todos are mirrored through a realtime view
- `write_policy = 'local_first'`
- the user edits while offline

What should happen:

1. the local row updates immediately and may become `__staged = true`
2. outbound sync waits until connectivity returns
3. on reconnect, the app calls `db.sync.sync()`
4. the origin accepts or conflicts the queued write
5. inbound authoritative state normalizes the local row

If two browsers changed the same todo while offline:

- one write can win
- the other can become `conflicted`
- both browsers still converge back to the same authoritative state

That is the kind of user-facing behavior these patterns are meant to support.

## Behavior 3: Keep the Local Database Off the UI Thread

Sometimes direct browser-local FlashQL is not the best fit.

The next application behavior becomes:

> "I want local-first and offline-first behavior, but I want the local database to live in a worker."

That is where worker-hosted FlashQL enters.

## Pattern C: `EdgeClient -> FlashQL (Worker/Shared Worker) -> Backend`

This is the shape for apps where:

- the UI should not host the local database directly
- the UI should talk to a worker-hosted local database through the same database client contract

In this pattern:

- the UI uses `EdgeClient`
- the worker hosts `FlashQL` through `EdgeWorker`
- that worker-hosted `FlashQL` can itself talk upstream through another `EdgeClient`

So the UI still only sees one `db`.

## Pattern C1: Dedicated Worker

### When to Choose It

Choose a dedicated worker when:

- each tab can own its own local database instance
- you want the database off the UI thread
- multi-tab coordination is not the main concern

### Shape

UI:

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  url: './db.worker.js',
  type: 'worker',
});
```

Dedicated worker:

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

EdgeWorker.webWorker({
  db: new FlashQL({
    getUpstreamClient: () => new EdgeClient({ url: '/api/db', type: 'http' }),
  }),
});
```

Backend:

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { PGClient } from '@linked-db/linked-ql/postgres';

const worker = new EdgeWorker({ db: new PGClient(), type: 'http' });
```

### What Is Automatic Here

The UI does not manually wire request listeners.

That whole request/response cycle is automatic:

- the UI uses `EdgeClient`
- the worker uses `EdgeWorker.webWorker(...)`
- the worker-hosted FlashQL behaves like a local database from the UI's point of view

So the effective chain is:

`UI EdgeClient -> worker EdgeWorker -> FlashQL -> upstream EdgeClient -> backend EdgeWorker -> PG`

The UI still feels like it has one database.

## Pattern C2: Shared Worker

### When to Choose It

Choose a shared worker when:

- the app is multi-tab
- you want one local database instance across tabs
- sync and WAL subscriptions should not be duplicated per tab

### Shape

UI:

```js
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new EdgeClient({
  url: './db.js',
  type: 'shared_worker',
});
```

Shared worker:

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

EdgeWorker.sharedWorker({
  db: new FlashQL({
    getUpstreamClient: () => new EdgeClient({ url: '/api/db', type: 'http' }),
  }),
});
```

Backend:

```js
import { EdgeWorker } from '@linked-db/linked-ql/edge-worker';
import { PGClient } from '@linked-db/linked-ql/postgres';

const worker = new EdgeWorker({ db: new PGClient(), type: 'http' });
```

### Why This Is Often the Nicest PWA Shape

- one local database instance across tabs
- one place for sync to keep running
- one local persistence surface
- less UI-thread pressure
- cleaner multi-tab conflict behavior

For many local-first PWAs, this is the strongest production shape.

## Transport Choice: HTTP vs Worker Ports

At this point the question is no longer "which topology looks cool?"

It is:

> "Which transport boundary best serves the behavior I need?"

### HTTP Is Strongest When

- the boundary is truly remote
- you want the broadest interoperability
- you care about streamed bodies
- you care about generic web payloads such as blobs and binary uploads

### Worker/Message-Port Transport Is Strongest When

- the boundary is inside the same browser process
- you want a worker-hosted database
- you want low-overhead communication between UI and worker
- you want live commits and control signals over the worker channel

Today, HTTP is the more natural place to lean when the app also needs general file/blob transport alongside the LinkedQL protocol story.

## How the Major Features Travel Through These Chains

### Streaming Rows

The app still writes:

```js
const rows = await db.stream(`SELECT * FROM public.users`);
```

Depending on the transport chain, rows may travel:

- as streamed HTTP bodies
- or over worker/message ports in batches

So streaming stays efficient without changing the application contract.

### Live Queries

The app still writes:

```js
const result = await db.query(`SELECT * FROM public.users`, { live: true });
```

What changes is backend responsibility:

- worker transport can naturally carry commit events over ports
- HTTP transport needs a backend willing to keep the response alive
- frameworks such as Webflo make that especially natural

### Federation

Federation still happens at the database layer, not the app layer.

That means a local `FlashQL` can query:

- local tables
- runtime origin-backed views
- materialized views
- realtime views

as one relational graph, even if the app is talking to that local database through `EdgeClient`.

### Materialization

Materialization is the moment an origin-backed view becomes a local stored copy.

That is how the system crosses from:

- remote-only state

to:

- local state that survives network loss

### Sync

Sync is the control plane that keeps those materialized or realtime views healthy.

The host app should usually think about it like this:

- during healthy operation, let FlashQL do the automatic work
- on reconnect, call `db.sync.sync()`

That is the key operational story.

## Which Pattern Should You Start With?

### Start With Plain `EdgeClient -> Backend` When

- you mainly need transport
- local-first storage is not the primary requirement yet

### Start With `FlashQL -> Backend` When

- local-first behavior is the main product need
- one browser tab can own the local database directly

### Start With `EdgeClient -> FlashQL (Shared Worker) -> Backend` When

- the app is a serious PWA
- multi-tab behavior matters
- you want one local database instance across tabs

## Related Docs

- [Federation, Materialization, Realtime Views, and Write Paths](/flashql/foreign-io)
