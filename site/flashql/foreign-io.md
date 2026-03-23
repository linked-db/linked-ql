# Federation, Materialization, and Realtime Views

This page documents the current FlashQL model for working with remote data.

The old mental model was "foreign I/O" with separate `federate()` and `sync()` calls. That is no longer the right API surface.

Today, FlashQL models remote data through:

- foreign namespaces
- views whose `persistence` is `origin`, `materialized`, or `realtime`
- the FlashQL sync manager at `db.sync`

This model is more explicit and easier to reason about:

- namespaces describe *where a relation comes from*
- views describe *how that relation should behave locally*
- sync decides *which local copies should be reconciled or resumed*

## The moving parts

### 1. A foreign client factory

FlashQL needs a way to create upstream clients when a namespace points to a foreign origin.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new FlashQL({
  keyval,
  async onCreateForeignClient(origin) {
    if (origin === 'primary') {
      return new EdgeClient({
        url: 'https://api.example.com/db',
        dialect: 'postgres',
      });
    }
  },
});

await db.connect();
```

What this does:

- FlashQL stores the factory on its `StorageEngine`
- when a foreign namespace needs an upstream client, FlashQL asks for it by `origin`
- the same origin string can be reused by multiple views

### 2. A foreign namespace

The namespace records that some relations are backed by another origin.

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createNamespace({
    name: 'remote',
    replication_origin: 'primary',
    replication_origin_type: 'edge',
  });
});
```

What this does:

- `remote` becomes the namespace used in your local catalog
- `replication_origin: 'primary'` tells FlashQL which foreign client to ask for
- the `replication_origin_type` is descriptive metadata you can keep consistent with your architecture

### 3. Views that decide local behavior

Views define what kind of local presence a foreign relation should have.

FlashQL currently uses three important persistence modes:

- `origin`
- `materialized`
- `realtime`

## `origin` views

An `origin` view means: "this relation lives remotely; read it through FlashQL's query engine as part of the local graph."

### Example

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createView({
    namespace: 'remote',
    name: 'users',
    persistence: 'origin',
    view_spec: { namespace: 'public', name: 'users' },
  });
});
```

What this means:

- `remote.users` is now part of your local relational graph
- the underlying data still lives upstream
- queries against that view are federated at read time

Use `origin` views when:

- you want unified SQL across local and remote relations
- you do not need an offline copy
- you prefer fresh reads from the source

## `materialized` views

A `materialized` view means: "keep a local table-shaped copy and refresh it when sync runs."

### Example

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createView({
    namespace: 'public',
    name: 'users_cache',
    persistence: 'materialized',
    view_spec: { namespace: 'remote', name: 'users' },
  });
});
```

What this means:

- `public.users_cache` is stored locally
- FlashQL pulls rows from `remote.users` during `db.sync.sync()`
- after materialization, your app can query the local copy without talking to the network

Use `materialized` views when:

- you want offline reads
- you want predictable local read latency
- periodic reconciliation is enough

## `realtime` views

A `realtime` view means: "materialize locally, then keep the local copy hot by subscribing upstream."

### Example

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createView({
    namespace: 'public',
    name: 'posts_live',
    persistence: 'realtime',
    view_spec: { namespace: 'remote', name: 'posts' },
  });
});
```

What this means:

- FlashQL keeps a local mirror of the upstream relation
- `db.sync.sync()` bootstraps the local state and starts the realtime job
- later upstream commits flow into the local table through WAL/changefeed subscription

Use `realtime` views when:

- you want local querying
- you also want the local copy to stay warm after boot
- you are building local-first feeds, inboxes, dashboards, or collaborative surfaces

## One complete local-first setup

This is the pattern most readers are actually looking for: a local runtime that can query remote data directly, cache some of it, and keep some of it hot.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';
import { IndexedDBKV } from '@webqit/keyval/indexeddb';

const db = new FlashQL({
  keyval: new IndexedDBKV({ path: ['my-app'] }),
  async onCreateForeignClient(origin) {
    if (origin === 'primary') {
      return new EdgeClient({
        url: 'https://api.example.com/db',
        dialect: 'postgres',
      });
    }
  },
});

await db.connect();

await db.storageEngine.transaction(async (tx) => {
  // Foreign namespace backed by the "primary" origin
  await tx.createNamespace({
    name: 'remote',
    replication_origin: 'primary',
    replication_origin_type: 'edge',
  });

  // 1. Origin view: federated at read time
  await tx.createView({
    namespace: 'remote',
    name: 'users',
    persistence: 'origin',
    view_spec: { namespace: 'public', name: 'users' },
  });

  // 2. Materialized view: local cache populated on sync
  await tx.createView({
    namespace: 'public',
    name: 'users_cache',
    persistence: 'materialized',
    view_spec: { namespace: 'remote', name: 'users' },
  });

  // 3. Realtime view: local mirror kept hot after sync
  await tx.createView({
    namespace: 'public',
    name: 'posts_live',
    persistence: 'realtime',
    view_spec: { namespace: 'remote', name: 'posts' },
  });
});

// Run once at startup, then again on reconnect.
await db.sync.sync();

const result = await db.query(`
  SELECT
    u.id,
    u.name,
    p.title
  FROM public.users_cache u
  LEFT JOIN public.posts_live p ON p.author_id = u.id
  ORDER BY u.id
`);
```

How to read this example:

- `remote.users` is a federated view of the upstream `public.users` relation
- `public.users_cache` is a local cache populated during sync
- `public.posts_live` is a local mirror that keeps receiving upstream changes after sync
- the final query is ordinary local SQL from your application's point of view

This is the core FlashQL value proposition:

- local query ergonomics
- explicit placement of data
- selective federation and selective local copying

## `db.sync`

`db.sync` is FlashQL's orchestration layer for sync-enabled views.

It is designed as a single idempotent entry point:

- call it on startup
- call it on reconnect
- call it again if you are unsure whether sync jobs are already running

### `await db.sync.sync(selector?)`

Bootstraps or resumes the selected sync-enabled views.

```js
await db.sync.sync();
await db.sync.sync({ public: ['users_cache', 'posts_live'] });
```

What it does:

- discovers matching sync-enabled views
- ensures sync jobs exist
- materializes missing or stale materialized views
- starts realtime jobs that should be running
- coalesces overlapping calls so reconnect storms do not multiply the work

### `await db.sync.status(selector?)`

Reports the current state of sync-managed views.

```js
const status = await db.sync.status({ public: ['posts_live'] });
console.log(status);
```

Typical fields include:

- the view name
- its mode, such as `materialized` or `realtime`
- whether it is enabled
- whether it is `idle`, `synced`, or `running`

### `await db.sync.stop(selector?)`

Stops selected realtime jobs and disables them.

```js
await db.sync.stop({ public: ['posts_live'] });
```

### `await db.sync.resume(selector?)`

Re-enables selected stopped realtime jobs.

```js
await db.sync.resume({ public: ['posts_live'] });
```

### When to call `sync.sync()`

The practical rule is:

- call it after app startup
- call it again when network connectivity comes back

Because the entry point is idempotent and overlapping runs are coalesced, you do not need a fragile "did I already start sync?" layer in the app just to be safe.

See also: [FlashQL Sync](/flashql/sync)

## Federation vs materialization vs realtime

This distinction is worth stating plainly because it is the heart of the model.

| Mode | Where rows live | When network is used | Best for |
| :-- | :-- | :-- | :-- |
| `origin` | upstream | on query execution | direct federation |
| `materialized` | local copy | on sync | offline reads and caches |
| `realtime` | local copy | on sync and upstream subscription | local-first live data |

If you are unsure which to pick:

- start with `origin` if you only need unified reads
- move to `materialized` when you need an offline or fast local copy
- move to `realtime` when that local copy must stay fresh without waiting for another manual sync

## What this page does not claim

To avoid teaching outdated ideas, a few explicit non-claims are important:

- FlashQL does **not** currently expose the old `federate()` and `materialize()` methods documented in earlier drafts
- FlashQL does **not** currently document a universal bidirectional conflict-resolution sync layer here
- the current sync story is about local materialization and realtime mirroring of upstream sources

That narrower statement is deliberate. It matches the code and the tests today.
