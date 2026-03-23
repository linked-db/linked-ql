# Query Interface

LinkedQL is designed around one application-facing database shape:

- `db.query()` for buffered query execution
- `db.stream()` for lazy row-by-row consumption
- `db.transaction()` for explicit transactional work
- `db.wal.subscribe()` for table-level changefeeds

That shape is shared across:

- mainstream database clients such as `PGClient`, `MySQLClient`, and `MariaDBClient`
- `EdgeClient`, which talks to a remote worker or server over transport
- `FlashQL`, which runs the engine locally in-process

The method names stay familiar across runtimes, but not every advanced capability exists on every client. For example:

- `query()`, `stream()`, `transaction()`, and `wal.subscribe()` are part of the common contract
- `sync` is part of FlashQL's richer local-first orchestration layer, not the universal client contract

If you only remember one thing from this page, let it be this: LinkedQL tries to keep the way you *talk* to data stable, even when the place where the data lives changes.

## `db.query()`

`query()` is the default way to execute SQL in LinkedQL. Use it when you want the result buffered into memory as a `Result`, or when you want a `RealtimeResult` for a live query.

### Invocation forms

LinkedQL normalizes several call shapes into the same internal form.

```ts
await db.query('SELECT * FROM users');
await db.query('SELECT * FROM users WHERE id = $1', [1]);
await db.query('SELECT * FROM users WHERE id = $1', { values: [1] });
await db.query('SELECT * FROM users', { live: true });
await db.query('SELECT * FROM users', callback, { live: true });

await db.query({ query: 'SELECT * FROM users' });
await db.query({ text: 'SELECT * FROM users' });
await db.query({ url: 'SELECT * FROM users' });
```

### What `query()` accepts

#### SQL text

```js
const result = await db.query(`
  SELECT id, email
  FROM public.users
  ORDER BY id
`);
```

Use this form when you already know the SQL you want to run.

#### SQL text plus positional values

```js
const result = await db.query(
  'SELECT id, email FROM public.users WHERE active = $1',
  [true]
);
```

Use this form when you want parameterization and a short call site.

#### SQL text plus options

```js
const result = await db.query(
  'SELECT id, email FROM public.users WHERE created_at >= $1',
  {
    values: [new Date('2026-01-01')],
    dialect: 'postgres',
  }
);
```

Use this form when you want to control execution with options such as:

- `values`
- `dialect`
- `live`
- `id`
- `signal`
- `tx`

#### SQL text plus live callback

```js
const commits = [];

const result = await db.query(
  'SELECT id, name FROM public.users WHERE active = true ORDER BY id',
  (commit) => commits.push(commit),
  { live: true }
);
```

This form is for live queries. The callback receives live-query commit objects while `result.rows` remains a reactive view of the result set.

See also:

- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)

### Common options

| Option | Where it matters | What it does |
| :-- | :-- | :-- |
| `values` | all query-capable clients | Supplies positional parameters |
| `dialect` | especially FlashQL | Overrides the client's default dialect for this query |
| `live` | clients with realtime capability | Turns the query into a live query and returns a `RealtimeResult` |
| `id` | live queries and WAL subscriptions | Gives the stream a stable slot id for resumable/forgettable subscriptions |
| `signal` | live queries | Lets an `AbortSignal` abort the live result |
| `tx` | explicit transactions | Runs the query inside an existing transaction |

### What `query()` returns

`query()` returns one of two things:

- a `Result` for regular execution
- a `RealtimeResult` for `{ live: true }`

## `Result`

`Result` is the buffered result type for regular query execution.

### Properties

| Property | Type | Meaning |
| :-- | :-- | :-- |
| `rows` | `any[]` | The returned rows, if the statement produced a result set |
| `rowCount` | `number` | Number of rows affected by non-returning writes |
| `affectedRows` | `number` | Alias of `rowCount`, useful for MySQL/MariaDB-style code |

### Reading `Result` correctly

One thing often trips people up:

- `rowCount` is **not** the number of returned rows
- `rows.length` tells you how many rows were returned
- `rowCount` tells you how many rows were affected by a write that did **not** return rows

### Examples

#### `SELECT`

```js
const result = await db.query('SELECT id, name FROM public.users ORDER BY id');

console.log(result.rows);
// [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }]

console.log(result.rowCount);
// 0
```

#### `INSERT ... RETURNING`

```js
const result = await db.query(`
  INSERT INTO public.users (id, name)
  VALUES (3, 'Grace')
  RETURNING id, name
`);

console.log(result.rows);
// [{ id: 3, name: 'Grace' }]

console.log(result.rowCount);
// 0
```

#### `UPDATE` without `RETURNING`

```js
const result = await db.query(`
  UPDATE public.users
  SET active = false
  WHERE active = true
`);

console.log(result.rows);
// []

console.log(result.rowCount);
// number of affected rows
```

## `RealtimeResult`

`RealtimeResult` is what you get from `query(..., { live: true })`.

It is still a result object, but it represents a query that continues to react to underlying table changes.

### Properties

| Property | Type | Meaning |
| :-- | :-- | :-- |
| `rows` | `any[]` | The current live rows for the query |
| `hashes` | `string[]` | Internal row identity hashes used for diffing |
| `mode` | `string` | The realtime delivery mode, such as `'live'` or `'streaming'` |

### Methods

#### `await result.abort()`

Stops the live query.

```js
await result.abort();
```

If the live query was created with a stable `id`, some runtimes also support:

```js
await result.abort({ forget: true });
```

That asks the underlying runtime to forget any persisted slot state tied to that id.

### Example: live rows plus explicit commit callback

```js
const commits = [];

const result = await db.query(
  `SELECT id, name FROM public.rt_live WHERE id > 1 ORDER BY id`,
  (commit) => commits.push(commit),
  { live: true }
);

console.log(result.rows);
// current rows that will keep changing

console.log(result.mode);
// for example: 'streaming'

await result.abort();
```

### What is happening here

- the initial query runs immediately
- the current rows are exposed through `result.rows`
- later table changes produce live commits
- those commits update `result.rows`
- calling `abort()` disconnects the live result

For a fuller walkthrough, see [Live Queries](/capabilities/live-queries).

## `db.stream()`

`stream()` is for lazy, pull-based consumption of rows.

Use it when:

- the result may be large
- you do not want all rows materialized into memory at once
- you want `for await ... of` style iteration

This is not the same thing as a live query. A live query stays subscribed to future changes. A stream gives you an async iterable over the rows of one query execution.

### Example

```js
const asyncIterable = await db.stream(`
  SELECT id, email
  FROM public.users
  ORDER BY id
`);

for await (const row of asyncIterable) {
  console.log(row);
}
```

### Why `stream()` exists

Buffered results are convenient:

```js
const result = await db.query('SELECT * FROM huge_table');
```

But sometimes you do not want millions of rows collected into one array before your app can do any work. `stream()` lets you consume rows lazily and on demand.

See also: [Streaming](/capabilities/streaming)

## `db.transaction()`

`transaction(cb)` gives you an explicit transactional scope.

```js
await db.transaction(async (tx) => {
  // do multiple things atomically
});
```

What `tx` looks like depends on the client family:

- mainstream DB clients pass a driver-backed transaction handle that you feed back into `query(..., { tx })`
- `EdgeClient` passes a transaction token with `id`, `query()`, `stream()`, `commit()`, and `rollback()`
- `FlashQL` passes its storage transaction object

The callback shape is stable, but the transaction object itself is intentionally native to the runtime.

### Mainstream client example

```js
await db.transaction(async (tx) => {
  await db.query(
    'INSERT INTO public.users (id, name) VALUES ($1, $2)',
    { values: [1, 'Ada'], tx }
  );

  await db.query(
    'UPDATE public.users SET active = true WHERE id = $1',
    { values: [1], tx }
  );
});
```

### Edge client example

```js
await edge.transaction(async (tx) => {
  await tx.query('INSERT INTO public.users (id, name) VALUES (1, \'Ada\')');

  const rows = [];
  for await (const row of await tx.stream('SELECT id, name FROM public.users')) {
    rows.push(row);
  }
});
```

### FlashQL example

```js
await flash.transaction(async (tx) => {
  const table = tx.getTable({ namespace: 'public', name: 'users' });
  await table.insert({ id: 1, name: 'Ada' });
});
```

### Transaction rules worth knowing

- if the callback resolves, LinkedQL commits
- if the callback throws, LinkedQL rolls back
- live queries are not supported inside explicit transactions

## `db.wal.subscribe()`

`wal.subscribe()` is LinkedQL's table-level changefeed API.

Use it when you care about table mutations directly rather than about a query result.

### Minimal form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

### Filtered form

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users', 'orders'] },
  (commit) => {
    console.log(commit.entries);
  }
);
```

### Selector forms

The selector is normalized into a namespace-to-table map. Common forms are:

```js
'*'
{ public: ['users', 'orders'] }
[{ namespace: 'public', name: 'users' }]
```

### Stable subscription slots

You can attach an id to a subscription:

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => {
    console.log(commit);
  },
  { id: 'users_slot' }
);
```

That lets runtimes with persistent slot support keep track of catch-up state.

To drop the slot itself:

```js
await unsubscribe({ forget: true });
```

### What commit objects contain

At minimum, table-level commits contain entries like:

```js
{
  op: 'insert' | 'update' | 'delete',
  relation: { namespace: 'public', name: 'users' },
  old: ...,
  new: ...
}
```

The exact commit shape varies with the operation and runtime, but the main idea stays the same: a commit tells you what table changed and how.

See also: [Changefeeds](/capabilities/changefeeds)

## FlashQL-specific orchestration

If you are using FlashQL, there is one more layer above the universal query interface:

- foreign namespaces
- origin/materialized/realtime views
- `db.sync.sync()` and related sync controls

Those are documented separately because they are not part of the cross-client contract.

Continue with:

- [FlashQL](/flashql)
- [FlashQL Sync](/flashql/sync)
- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
