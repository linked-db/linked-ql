# Capabilities Overview

This section is where LinkedQL stops looking like "just another SQL client" and starts showing its actual shape.

The capabilities fall into three broad groups:

- language capabilities that change how you write queries
- runtime capabilities that change how query results behave
- FlashQL capabilities that change where your database logic can live

## How to read this section

If you are new here:

- start with the summary tables
- open the examples that match the problem you are trying to solve
- then follow the focused pages for the exact syntax and behavior

The overview is here to orient you. The inner capability pages are where the exhaustive details live.

## Language capabilities

These features extend what SQL can *say*.

| Capability | What it gives you | Docs |
| :-- | :-- | :-- |
| DeepRefs | Relationship traversal and relationship-aware shaping in query syntax | [DeepRefs](/capabilities/deeprefs) |
| Structured Writes | Relationship-aware inserts and updates in SQL-shaped DML | [Structured Writes](/capabilities/structured-writes) |
| JSON Literals | Native object and array shaping in query output | [JSON Literals](/capabilities/json-literals) |
| UPSERT | PostgreSQL-style `INSERT ... ON CONFLICT` workflows | [UPSERT](/capabilities/upsert) |
| Version Binding | Query-time relation version contracts | [Version Binding](/capabilities/version-binding) |

### Example: JSON shaping directly in SQL

```js
const result = await db.query(`
  SELECT
    id,
    { first: first_name, last: last_name } AS name,
    { email, phone: phone_number } AS contact
  FROM public.users
  ORDER BY id
`);
```

What this shows:

- the query itself shapes the object graph
- the application does not need a second transformation pass just to assemble a pleasant payload

### Example: relationship traversal with DeepRefs

```js
const posts = await db.query(`
  SELECT
    title,
    author ~> { name, email }
  FROM public.posts
  WHERE published = true
`);
```

What this shows:

- `author ~> ...` traverses a relationship directly in query syntax
- you stay inside SQL instead of bouncing to ORM relation loaders

### Example: relationship-aware writes

```js
await db.query(`
  INSERT INTO public.posts
    (title, author ~> (id, name))
  VALUES
    ('LinkedQL', ROW(1, 'Ada'))
`);
```

This is one of the areas where the dedicated page matters most:

- [Structured Writes](/capabilities/structured-writes)

## Runtime capabilities

These features extend how query results and database changes behave at runtime.

| Capability | What it gives you | Docs |
| :-- | :-- | :-- |
| Live Queries | A query result that keeps tracking the underlying data | [Live Queries](/capabilities/live-queries) |
| Streaming | Lazy, on-demand async iteration over large results | [Streaming](/capabilities/streaming) |
| Changefeeds (WAL) | Table-level subscriptions to structured commits | [Changefeeds](/capabilities/changefeeds) |
| Version Binding | A way to fail fast when the relation version assumed by the query is not what storage exposes | [Version Binding](/capabilities/version-binding) |

### Example: live query

```js
const result = await db.query(`
  SELECT p.title, u.name
  FROM public.posts p
  LEFT JOIN public.users u ON p.author = u.id
  WHERE p.published = true
  ORDER BY p.created_at DESC
`, { live: true });

console.log(result.rows);

await result.abort();
```

What this shows:

- the result is query-shaped, not table-shaped
- you ask for a query once and keep reading its current rows

### Example: table-level changefeed

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['posts'] },
  (commit) => {
    console.log(commit.entries);
  }
);

await unsubscribe();
```

What this shows:

- live queries answer "what does this query look like now?"
- WAL subscriptions answer "what table changes just happened?"

### Example: streaming

```js
for await (const row of await db.stream(`
  SELECT id, email
  FROM public.big_table
  ORDER BY id
`)) {
  console.log(row);
}
```

What this shows:

- rows are consumed lazily
- you do not have to materialize the full result in memory up front

## FlashQL capabilities

FlashQL is where LinkedQL's local-runtime and orchestration story becomes concrete.

| Capability | What it gives you | Docs |
| :-- | :-- | :-- |
| Local runtime | A SQL engine inside the app, worker, or edge runtime | [FlashQL](/flashql) |
| Federation | Query local and remote relations through one graph | [Federation, Materialization, and Realtime Views](/flashql/foreign-io) |
| Materialization | Pull remote data into a local copy on sync | [Federation, Materialization, and Realtime Views](/flashql/foreign-io) |
| Realtime mirroring | Keep a local copy hot after sync | [Federation, Materialization, and Realtime Views](/flashql/foreign-io) |
| Sync orchestration | Idempotent startup/reconnect reconciliation for sync-enabled views | [FlashQL Sync](/flashql/sync) |
| Point-in-time boot | Boot a local store at a chosen historical relation version | [FlashQL](/flashql) |

### Example: federated + local-first FlashQL shape

```js
await db.storageEngine.transaction(async (tx) => {
  await tx.createNamespace({
    name: 'remote',
    replication_origin: 'primary',
    replication_origin_type: 'edge',
  });

  await tx.createView({
    namespace: 'remote',
    name: 'users',
    persistence: 'origin',
    view_spec: { namespace: 'public', name: 'users' },
  });

  await tx.createView({
    namespace: 'public',
    name: 'users_cache',
    persistence: 'materialized',
    view_spec: { namespace: 'remote', name: 'users' },
  });

  await tx.createView({
    namespace: 'public',
    name: 'posts_live',
    persistence: 'realtime',
    view_spec: { namespace: 'remote', name: 'posts' },
  });
});

await db.sync.sync();
```

What this shows:

- `origin` gives you federation
- `materialized` gives you a local cache
- `realtime` gives you a local mirror that stays fresh after sync

This model is central enough that it has its own full page:

- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)

## Suggested reading paths

Choose a path based on the kind of problem you are solving:

### "I need reactive app data"

- [Query Interface](/docs/query-api)
- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)
- [Streaming](/capabilities/streaming)

### "I need richer SQL syntax"

- [FlashQL Language Reference](/flashql/lang)
- [DeepRefs](/capabilities/deeprefs)
- [Structured Writes](/capabilities/structured-writes)
- [JSON Literals](/capabilities/json-literals)

### "I need local-first architecture"

- [FlashQL](/flashql)
- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
- [FlashQL Sync](/flashql/sync)
- [Version Binding](/capabilities/version-binding)
