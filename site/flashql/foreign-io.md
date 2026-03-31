# Federation, Materialization, and Realtime Views

FlashQL lets you treat local and remote data as one database — while controlling:

- what stays remote
- what is cached locally
- and what stays continuously in sync

This is powered by namespaces, views, and the `db.sync` API.

## The core model

Two things work together to form the foreign I/O system:

1. A local database view to points to the foreign origin
2. An instance of the remote database client

At a high level, the system works like this:

1. Views define how that data is exposed locally
2. The remote database client lets the local FlashQL instance talk to the remote instance

## The views

In FlashQL, views are a native concept. You define them to execute a predefined query ondemand:

```js
await db.query(`
  CREATE VIEW posts AS
  SELECT title, content FROM public.blog
`);
```

The above implies that there's a `public.blog` table in the local database. That table will be hit on each attempt to query the `posts` view.

FLashQL extends this standard concept of a view to support federation and sync – letting views resolve from a remote database instead of the local.

```js
await db.query(`
  CREATE VIEW posts AS
  SELECT title, content FROM public.blog
  WITH (replication_origin = 'http://db.url.com/path')
`);
```

<details>
<summary>The equivalent lower level API would be (click to show)</summary>

```js
await db.transaction(async (tx) => {
  await tx.createView({
    name: 'posts',
    source_expr: 'SELECT title, content FROM public.blog',
    replication_origin: 'http://db.url.com/path',
  });
});
```

</details>

## The foreign client factory (resolving `replication_origin`)

`onCreateForeignClient()` is where your application interprets `replication_origin`.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new FlashQL({
  keyval,
  async onCreateForeignClient(originUrl) {
    return new EdgeClient({
      url: originUrl,
      dialect: 'postgres',
    });
  },
});

await db.connect();
```

The callback receives exactly the `replication_origin` value you stored.

It is expected to use the value of this property to create the appropriate foreign client instance that FlashQL sees.

## Replication modes

A view's replication mode is what decides how origin data should behave locally.

Values can be:

- `none`
- `materialized`
- `realtime`

### Basic views

Basic views are simply a predefined query that executes each time the view is accessed:

```js
await db.query(`
  CREATE VIEW public.users AS
  SELECT * FROM public.users
  WITH (replication_origin = 'http://db.url.com/path')
`);
```

Behavior:

- the view is queryable locally as `public.users`
- the rows themselves are not copied into local table storage
- each read resolves through the upstream client

Use this when you do not need an offline copy.

### `materialized` views

`materialized` views pull rows from the source relation into local storage:

```js
await db.query(`
  CREATE MATERIALIZED VIEW public.users AS
  SELECT * FROM public.users
  WITH (replication_origin = 'http://db.url.com/path')
`);
```

Use this when:

- you need offline reads
- you want predictable local read latency
- periodic reconciliation is enough

### `realtime` views

`realtime` views materialize data locally, then keep the local copy in sync

```js
await db.query(`
  CREATE REALTIME VIEW public.posts AS
  SELECT * FROM public.posts
  WITH (replication_origin = 'http://db.url.com/path')
`);
```

Behavior:

- rows are copied into the local view
- the view stays subscribed to origin table
- upstream commits automatically apply to the local view

Use this when: you want local querying and you also want the local copy to stay fresh

## `db.sync.sync()`

`db.sync.sync()` is the orchestration API for views.

```js
await db.sync.sync();
await db.sync.sync({ public: ['users_cache', 'posts'] });
```

### What it does

This:

- discovers declared views–matching the specified selector, if provided
- materializes views that are defined as "materialized" views, if not already materialed
- starts or resumes realtime sync jobs for "realtime" views, if not already started


The sync API is covered in detail in [Sync](/flashql/sync)

---

#### Redefinition patterns

FlashQL supports the custom `IF NOT EXUSTS` flag for the `CREATE VIEW` statement:

```js
await db.query(`
  CREATE VIEW IF NOT EXUSTS remote.posts AS
  SELECT * FROM public.posts
  WITH (replication_origin = '/api/db')
`);
```

It also supports the standard `OR REPLACE` directive:

```js
await db.query(`
  CREATE OR REPLACE VIEW remote.posts AS
  SELECT * FROM public.posts
  WITH (replication_origin = '/api/db')
`);
```

The `ALTER` statement form can also be used to update the schema:

```js
await db.query(`
  ALTER VIEW remote.posts AS
  SELECT * FROM public.posts
`);
```

The view's attributes may also be updated this way:

```js
// Change the replication_origin
await db.query(`
  ALTER VIEW remote.posts SET (replication_origin = 'https://example.com/api/db')
`);
```

```js
// Change the replication_mode from MATERIALIZED to REALTIME or NONE
// and vice-versa
await db.query(`
  ALTER VIEW remote.posts SET (replication_mode = REALTIME)
`);

await db.query(`
  ALTER VIEW remote.posts SET (replication_mode = MATERIALIZED)
`);

await db.query(`
  ALTER VIEW remote.posts SET (replication_mode = NONE)
`);
```

The view's attributes may be reset to their defaults:

```js
// Reset replication_mode to NONE
await db.query(`
  ALTER VIEW remote.posts RESET (replication_mode)
`);

// Reset replication_origin to null.
// This makes the view resolve from the local database rather than from a remote database
await db.query(`
  ALTER VIEW remote.posts SET (replication_origin)
`);
```
