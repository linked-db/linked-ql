# Federation, Materialization, and Realtime Views

FlashQL lets you treat local and remote data as one database — while controlling:

- what stays remote
- what is cached locally
- and what stays continuously in sync

This is powered by views.

## The core model

Two things work together to form the foreign I/O system:

1. A local database view that points to the foreign origin
2. An instance of the remote database client

At a high level, the system works like this:

1. Views define how that data is exposed locally
2. The remote database client lets the local FlashQL instance talk to the remote instance

## The views

In FlashQL, views are a native concept. You define them to execute a predefined query ondemand:

```js
await db.query(`
  CREATE VIEW public.posts AS
  SELECT title, content FROM public.blog
`);
```

That specified query will be run everytime you hit the `posts` view. The above implies that there's a `public.blog` table in the local database. That table becomes the ultimate data source for the result returned.

FLashQL extends this standard concept of a view to support federation and sync – letting views resolve from a remote database instead of the local.

```js
await db.query(`
  CREATE VIEW public.posts AS
  SELECT title, content FROM public.blog
  WITH (replication_origin = 'http://db.url.com/path')
`);
```

<details>
<summary>The equivalent lower level API would be (click to show)</summary>

```js
await db.transaction(async (tx) => {
  await tx.createView({
    namespace: 'public',
    name: 'posts',
    source_expr: 'SELECT title, content FROM public.blog',
    replication_origin: 'http://db.url.com/path',
  });
});
```

</details>

The `WITH (replication_origin = ...)` specifier is the part that turns a regular view into foreign view.

Now, querying `public.users` on the local database will query `public.users` on the upstream database:

```js
await db.query(`
  SELECT * FROM public.users;
`);
```

Being a regular table, it can be used just like one – e.g. in joins:

```js
await db.query(`
  SELECT * FROM public.posts
  LEFT JOIN public.users ON posts.user_id = users.id;
`);
```

The query executes as one relational graph – but composed of both local and remote data.

## The foreign client factory (resolving `replication_origin`)

To be able to talk to the upstream database, FlashQL needs an instance of the upstream database client. This client is provided via an `getUpstreamClient()` factory.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';

const db = new FlashQL({
  keyval,
  async getUpstreamClient(originUrl) {
    return new EdgeClient({
      url: originUrl,
      dialect: 'postgres',
    });
  },
});

await db.connect();
```
This is now a local FlashQL instance that can talk to an upstream database ondemand.

Above, the `getUpstreamClient()` callback will recieve `'/api/db'` – the value of the `replication_origin` config. It is expected to use the value of this property to create the appropriate foreign client instance that FlashQL sees.

## Replication modes

A view's replication mode is what decides how origin data should behave locally: as to whether data stays remote, or is cached locally, or stays in sync.

Values can be:

- `none`
- `materialized`
- `realtime`

### Runtime views (the default)

Runtime views are simply a predefined query that executes each time the view is accessed:

```js
await db.query(`
  CREATE VIEW public.users AS
  SELECT * FROM public.users
  WITH (replication_origin = 'http://db.url.com/path')
`);
```

Behavior:

- the view is queryable locally as `public.users`
- each read resolves through the upstream client at run-time
- the rows themselves are not copied into local table storage

The is the default idea of a database view – only extended to support resolving from foreign origins.

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

`realtime` views materialize data locally, then keep the local copy in sync:

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

Use this when: you want local querying – and want that synced.

## Namespace-wide replication origins

It is possible to set a default replication origin at the schema/namespace level.
Multiple views in the said namespace can easily inherit the specified origin.

```js
await db.query(`
  ALTER SCHEMA public SET (default_replication_origin = 'https://db.upstream.example.com')
`);
```

```js
await db.query(`
  CREATE SCHEMA remote WITH (default_replication_origin = 'https://db.upstream.example.com')
`);
```

A view inherits this by explicitly setting its replication origin to the keyword: `INHERIT`.

```js
await db.query(`
  CREATE VIEW remote.posts AS
  SELECT * FROM public.posts
  WITH (replication_origin = INHERIT)
`);
```

## `db.sync.sync()`

`db.sync.sync()` is the orchestration API for materialized and realtime views. A `CREATE VIEW` statement in FlashQL completes its work by calling this API to orchestrate the data movement.

```js
await db.sync.sync();
await db.sync.sync({ public: ['users_cache', 'posts'] });
```

### What it does

This:

- discovers declared views, or directly locates the views matched by the specified selector, if provided
- materializes views that are defined as "materialized" views, if not already materialed
- starts or resumes realtime sync jobs for "realtime" views, if not already started


The sync API is covered in detail in [Sync](/flashql/sync)

---

#### Redefinition patterns

FlashQL supports the custom `IF NOT EXUSTS` flag for the `CREATE VIEW` statement:

```js
await db.query(`
  CREATE VIEW IF NOT EXUSTS public.posts AS
  SELECT * FROM public.posts
  WITH (replication_origin = '/api/db')
`);
```

It also supports the standard `OR REPLACE` directive:

```js
await db.query(`
  CREATE OR REPLACE VIEW public.posts AS
  SELECT * FROM public.posts
  WITH (replication_origin = '/api/db')
`);
```

The `ALTER` statement form can also be used to update the schema:

```js
await db.query(`
  ALTER VIEW public.posts AS
  SELECT title AS headline, body AS content FROM public.posts
`);
```

The view's attributes may also be updated this way:

```js
// Change the replication_origin
await db.query(`
  ALTER VIEW public.posts SET (replication_origin = 'https://example.com/api/db')
`);
```

```js
// Change the replication_mode from MATERIALIZED to REALTIME or NONE
// and vice-versa
await db.query(`
  ALTER VIEW public.posts SET (replication_mode = REALTIME)
`);

await db.query(`
  ALTER VIEW public.posts SET (replication_mode = MATERIALIZED)
`);

await db.query(`
  ALTER VIEW public.posts SET (replication_mode = NONE)
`);
```

The view's attributes may be reset to their defaults:

```js
// Reset replication_mode to NONE
await db.query(`
  ALTER VIEW public.posts RESET (replication_mode)
`);

// Reset replication_origin to null.
// This makes the view resolve from the local database rather than from a remote database
await db.query(`
  ALTER VIEW public.posts RESET (replication_origin)
`);
```
