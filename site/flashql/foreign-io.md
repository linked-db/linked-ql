# Federation, Materialization, and Realtime Views

FlashQL lets you treat local and remote data as one database — while controlling:

- what stays remote
- what is cached locally
- and what stays continuously in sync

This is powered by namespaces, views, and the `db.sync` API.

## The core model

Three things work together to form the foreign I/O system:

1. A namespace (more commonly called a schema). This serves as a logical container for tables and views
2. A view or collection of views scoped to that namespace. The views are the containers for data from the foreign origin
3. the `db.sync.sync()` API. This executes the definitions — materializing data and starting sync where required

At a high level, the system works like this:

1. A namespace defines where data comes from (local vs foreign origin)
2. Views define how that data is exposed locally
3. `db.sync.sync()` turns those definitions into actual data + subscriptions

## The namespaces

In FlashQL, a namespace is the schema-level container for relations and other schema objects.

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createNamespace({
    name: 'crm',
  });
});
```

That gives you a normal schema for database objects like tables and views:

- `crm.users`
- `crm.orders`
- `crm.audit_log`

### Attaching a `replication_origin`

A namespace may optionally define `replication_origin`.

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createNamespace({
    name: 'remote',
    replication_origin: 'primary',
  });
});
```

This means exactly one thing:

- all views in that namespace should be resolved from the foreign origin instead of the local database

The namespace is still just a schema that can contain normal tables and other objects.

### Defining `replication_origin`

`replication_origin` is an application-defined identifier or spec.

FlashQL does not interpret it — it simply passes it to your
`onCreateForeignClient()` hook, where you return the appropriate client.

`replication_origin` may, therefore, be:

- a bare identifier such as `'primary'`
- a database connection string
- an database connection object
- any other value your application wants to interpret at `onCreateForeignClient()`

Examples:

```js
replication_origin: 'primary'
replication_origin: 'postgres://user:pass@host/db'
replication_origin: { kind: 'edge', url: 'https://api.example.com/db' }
```

### Resolving `replication_origin` from foreign client factory

`onCreateForeignClient()` is where your application interprets `replication_origin`.

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

The callback receives exactly the `replication_origin` value you stored.

It is expected to use the value of this property to create the appropriate foreign client instance that FlashQL sees.

## The views

Once a namespace has `replication_origin`, views in that namespace are resolved from that origin instead of from the local database itself.

On defining views in a `replication_origin`-enabled namespace, you have data federation already automatically set up.

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

Here:

- `remote.users` is a view that resolves from a foreign origin
- `persistence: 'origin'` is one of three persistence modes as described below
- `view_spec: { namespace: 'public', name: 'users' }` specifies the source table in origin database: `public.users`

In summary, views are the abstraction boundary between local and remote data.
They define both where data comes from and how it behaves locally.

### The three persistence modes

A view's persistence mode is what decides how origin data should behave locally.

Values can be:

- `origin`
- `materialized`
- `realtime`

#### `origin` views

An `origin` view means:

> resolve the source relation through the foreign client at read time

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

Behavior:

- the view is queryable locally as `remote.users`
- the rows themselves are not copied into local table storage
- each read resolves through the upstream client

Use this when:

- you want unified SQL across local and remote relations
- you want fresh reads from the source
- you do not need an offline copy

#### `materialized` views

A `materialized` view means:

> pull rows from the source relation into local storage during sync

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createView({
    namespace: 'remote',
    name: 'users',
    persistence: 'materialized',
    view_spec: { namespace: 'public', name: 'users' },
  });
});
```

Behavior:

- the source relation is still defined by `view_spec`
- on calling `db.sync.sync()`, rows are copied into the local view
- subsequent reads can be satisfied locally

Use this when:

- you need offline reads
- you want predictable local read latency
- periodic reconciliation is enough

#### `realtime` views

A `realtime` view means:

> materialize locally, then keep the local copy hot after sync

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createView({
    namespace: 'remote',
    name: 'posts',
    persistence: 'realtime',
    view_spec: { namespace: 'public', name: 'posts' },
  });
});
```

Behavior:

- on calling `db.sync.sync()`, rows are copied into the local view
- the view stays subscribed to origin table
- upstream commits automatically apply to the local view

Use this when:

- you want local querying
- you also want the local copy to stay fresh
- you are building local-first feeds, dashboards, or collaborative surfaces

## One complete setup

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';
import { EdgeClient } from '@linked-db/linked-ql/edge';
import { IndexedDBKV } from '@webqit/keyval/indexeddb';

const db = new FlashQL({
  // Persistence storage
  keyval: new IndexedDBKV({ path: ['my-app'] }),
  // onCreateForeignClient() hook
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

  // A namesapce with replication_origin
  await tx.createNamespace({
    name: 'remote',
    replication_origin: 'primary',
  });

  // A normal local table
  await tx.createTable({
    namespace: 'remote',
    name: 'notes',
    columns: [
      { name: 'id', type: 'INT', primaryKey: true },
      { name: 'body', type: 'TEXT' },
    ],
  });

  // An "origin" view
  await tx.createView({
    namespace: 'remote',
    name: 'users',
    persistence: 'origin',
    view_spec: { namespace: 'public', name: 'users' },
  });

  // A "materialized" view
  await tx.createView({
    namespace: 'remote',
    name: 'profiles',
    persistence: 'materialized',
    view_spec: { namespace: 'public', name: 'profiles' },
  });

  // A "realtime" view
  await tx.createView({
    namespace: 'remote',
    name: 'posts',
    persistence: 'realtime',
    view_spec: { namespace: 'public', name: 'posts' },
  });
});

await db.sync.sync();
```

This setup shows all three layers at once:

- `remote` is a normal namespace with `replication_origin`
- `remote.notes` is an ordinary local table in that same namespace
- `remote.users` is an "origin" view, resolved on-the-fly
- `public.profiles` is a "materialized" view, resolved just once
- `public.posts` is a "realtime" view, kept in sync with origin table

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

### The `view_spec`

`view_spec` is the definition of the source relation behind a view.

`view_spec` is required for every view and must be an object.

FlashQL accepts exactly two shapes:

1. a reference-type spec
2. a query-type spec

#### Reference-type `view_spec`

This is the table-or-view reference form:

```js
view_spec: {
  namespace: 'public',
  name: 'users',
}
```

Accepted keys are:

- `namespace`
- `name`
- `filters`
- `joinStrategy`

Rules are:

- `name` is required
- `namespace` is optional
- if `namespace` is omitted, FlashQL defaults it to the view's own namespace
- `filters`, when present, must be an object
- any key outside the list above is rejected

Example:

```js
await tx.createView({
  namespace: 'remote',
  name: 'users',
  persistence: 'origin',
  view_spec: {
    namespace: 'public',
    name: 'users',
  },
});
```

If you omit `namespace`:

```js
view_spec: {
  name: 'users',
}
```

then FlashQL resolves that as if it were:

```js
view_spec: {
  namespace: 'remote',
  name: 'users',
}
```

the owning view namespace is used as the default.

##### `filters`

Reference-type specs may also include `filters`:

```js
view_spec: {
  namespace: 'public',
  name: 'users',
  filters: {
    active: true,
  },
}
```

At sync/runtime level:

- `filters` makes the view behave as a query-based source rather than a plain whole-table source
- that affects how sync treats commits and refresh behavior

In other words, once `filters` is present, the view is still reference-shaped, but operationally it behaves more like a derived query than a direct table mirror.

#### Query-type `view_spec`

This is the query-defined source form:

```js
view_spec: {
  query: `
    SELECT *
    FROM public.posts
    WHERE post_type = 'NEWS'
  `,
}
```

Accepted keys are:

- `query`
- `joinStrategy`

Rules enforced by the code:

- `query` must be present
- `columns` must not be supplied alongside a query-type view
- `constraints` must not be supplied alongside a query-type view
- any key outside the list above is rejected

FlashQL parses the query, resolves it through the source resolver, and infers the result schema from the query itself.

That means the query result columns become the view's local columns.

For `realtime` query-type views, FlashQL also prepends a system `__id` column and a primary key so the local mirror can track row identity across incremental commits.

#### Schema inference

If you do not provide explicit columns when creating the view, FlashQL infers them from the source.

For reference-type specs:

- FlashQL resolves the source relation from `namespace` + `name`
- it copies the source columns and constraints into the view definition

For query-type specs:

- FlashQL parses and resolves the query
- it derives the result schema from the query output

This is why most view definitions can stay short:

```js
await tx.createView({
  namespace: 'remote',
  name: 'users',
  persistence: 'origin',
  view_spec: { namespace: 'public', name: 'users' },
});
```

without requiring you to restate the full column list.

#### `joinStrategy`

Both reference-type and query-type specs may include `joinStrategy`.

```js
view_spec: {
  namespace: 'public',
  name: 'users',
  joinStrategy: {
    memoization: true,
    pushdownSize: 100,
  },
}
```

This is used by FlashQL's foreign-query execution path when a foreign view participates in joins.

The current code recognizes:

- `memoization`
- `pushdownSize`

##### `memoization`

When `memoization` is truthy, FlashQL memoizes the foreign stream so it can be reused instead of reopening the foreign source repeatedly in the same execution path.

##### `pushdownSize`

When `pushdownSize` is set and the join condition can be pushed down, FlashQL batches left-side join logic into foreign-side filtering queries.

That means:

- FlashQL evaluates a chunk of left-side join predicates
- rewrites them into foreign-side WHERE logic
- streams matching foreign rows in chunks

This is an execution optimization, not a change to the logical meaning of the view.

#### Practical reading

So in practice:

- use `{ namespace, name }` when the view maps directly to one upstream relation
- add `filters` when you want a filtered subset of that relation
- use `{ query }` when the source is a real SQL query rather than a single relation
- add `joinStrategy` either way when you need to tune foreign join execution
