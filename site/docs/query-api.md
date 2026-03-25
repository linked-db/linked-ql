# Query Interface

LinkedQL is designed around a stable application-facing API.

Across the supported runtimes, you keep the same core concepts:

- `db.query()` for regular SQL execution and live queries
- `db.stream()` for lazy row-by-row reads
- `db.transaction()` for explicit transactions
- `db.wal.subscribe()` for table-level changefeeds

That common surface is the contract, whether `db` is:

- a mainstream database client such as `PGClient`, `MySQLClient`, and `MariaDBClient`
- `EdgeClient`, which talks to a remote worker or server over transport
- `FlashQL`, which runs the engine locally in-process

## `db.query()`

`query()` is the primary method for executing SQL statements.

It supports several invocation forms.

### Signatures

```ts
db.query(sql: string): Promise<Result>
db.query(sql: string, values: any[]): Promise<Result>
db.query(sql: string, options: QueryOptions): Promise<Result>
db.query(sql: string, callback: Function, options: QueryOptions): Promise<RealtimeResult>
db.query(queryLike: { query: string; ... }): Promise<Result>
db.query(queryLike: { text: string; ... }): Promise<Result>
```

### General behavior

`query()`:

- executes the provided SQL text
- accepts parameters either positionally or through `options.values`
- accepts runtime options such as `dialect`, `live`, `signal`, `id`, or `tx`
- returns either a `Result` or, for live queries, a `RealtimeResult`

### Examples

#### Basic query execution

```js
const result = await db.query('SELECT * FROM users');
```

This executes the query and buffers the full result set into `result.rows`.

#### Parameterized query

```js
const result = await db.query('SELECT * FROM users WHERE active = $1', [true]);
```

This is the same query API, with positional parameters.

#### Query with options

```js
const result = await db.query('SELECT * FROM users WHERE created_at >= $1', {
  values: [new Date('2026-01-01')],
  dialect: 'postgres',
});
```

This form keeps values and execution options in one object.

#### Parameters through `options.values`

```js
const result = await db.query('SELECT * FROM users WHERE name = $1', { values: ['Ada'] });
```

Use this form when you want option-based invocation without a separate values array argument.

#### Live query form

```js
const result = await db.query('SELECT id, title FROM posts ORDER BY id', { live: true });
```

In live mode, the query stays open and `result.rows` becomes a live view.

#### Live query with callback

```js
const commits = [];

const result = await db.query(
  'SELECT id, title FROM posts ORDER BY id',
  (commit) => commits.push(commit),
  { live: true }
);
```

The callback form is also for live queries, but it changes the delivery model.

With a callback present:

- `result.rows` carries the initial result set
- subsequent updates are emitted to the callback as commit events
- `result.mode` tells you how that `RealtimeResult` is being delivered

In other words, the callback form is the commit-stream interface, not the self-updating `rows` interface.

## `Result`

`Result` represents the outcome of a regular query.

All non-live `query()` operations return a `Result` object that can contain both row data and write metadata, though only one of those is meaningful for a given statement.

### Properties

| Property | Type | Description |
| :-- | :-- | :-- |
| `rows` | `any[]` | Result set as an array of row objects |
| `rowCount` | `number` | Number of rows affected by a non-returning write |
| `affectedRows` | `number` | Alias of `rowCount`, useful for MySQL/MariaDB-style code |

### Reading `Result` correctly

`rowCount` is not the number of returned rows.

It is instead the number of rows affected by an `INSERT`, `UPDATE`, or `DELETE` that does not itself return rows.

Quick reference:

| Operation | Returns `rows` | Affects `rowCount` |
| :-- | :-- | :-- |
| `SELECT` | yes | no |
| `INSERT/UPDATE/DELETE ... RETURNING` | yes | no |
| `INSERT/UPDATE/DELETE` | no | yes |

### Examples

#### A fetch operation

```js
const result = await db.query('SELECT id, name FROM users');
console.log(result.rows);
// [{ id: 1, name: 'Ada' }]
console.log(result.rowCount);
// 0
```

`rowCount` stays `0` here because this is a read query. The returned rows live in `result.rows`.

#### A write operation with `RETURNING`

```js
const result = await db.query(
  'INSERT INTO users (name) VALUES ($1) RETURNING *',
  ['Bob']
);
console.log(result.rows);
// [{ id: 2, name: 'Bob' }]
console.log(result.rowCount);
// 0
```

`RETURNING` turns the write into a result-set query, so the inserted rows come back in `rows`.

#### A write operation without `RETURNING`

```js
const result = await db.query(
  'INSERT INTO users (name) VALUES ($1)',
  ['Eve']
);
console.log(result.rowCount);
// 1
console.log(result.rows);
// []
```

Without `RETURNING`, the write reports through `rowCount` instead.

## `RealtimeResult`

`RealtimeResult` is the result of a [live query](/capabilities/live-queries): a query executed with `{ live: true }`.

It extends the ordinary idea of a `Result` into a live view of query results that continues to reflect the underlying dataset over time.

### Properties

| Property | Type | Description |
| :-- | :-- | :-- |
| `rows` | `any[]` | Result rows for the `RealtimeResult`; in callback-free live mode this is the self-updating live view, while in callback mode it carries the initial result set |
| `hashes` | `string[]` | Internal row identifiers used for diff tracking |
| `mode` | `string` | Delivery mode such as `'live'`, `'streaming'`, or `'streaming_only'`; this tells you how `rows` and commits are being delivered |

Treat `rows` and `hashes` as read-only. Manual mutation can desynchronize the internal state that keeps the live result coherent.

### Methods

#### `await result.abort()`

Terminates the live query and stops further updates to the live view.

```js
await result.abort();
```

If the live query was created with a stable `id`, pass `{ forget: true }` to also drop the internal slot bound to that `id`:

```js
await result.abort({ forget: true });
```

That ends reactivity. The array stops updating.

### Behavior

`RealtimeResult` is the result type for live queries.

How you consume it depends on `mode`:

- in live-view mode, `rows` is the self-updating query result
- in callback-driven mode, `rows` is the initial result and later updates arrive as commits

Once aborted, the live result stops advancing.

### Example

```js
const result = await db.query(
  'SELECT id, name FROM users ORDER BY id',
  { live: true }
);

console.log(result.rows);
// current rows; this array keeps mutating as the query stays live
console.log(result.mode);
// 'live'

await result.abort();
```

### Observing mutations

Because live rows are implemented through the Observer protocol, they can be observed like other mutatable JavaScript objects:

```js
import { Observer } from '@webqit/observer';

Observer.observe(result.rows, Observer.subtree(), (mutations) => {
  console.log(mutations);
});
```

This exposes the mutations applied to the live result as it changes over time.

At root level, you observe row additions and removals. With `Observer.subtree()`, you also observe field-level changes inside the live rows.

## `db.stream()`

`stream()` is the lazy, pull-based alternative to `query()`.

Use it when:

- the result may be large
- you do not want all rows buffered into memory first
- you want `for await ... of` iteration

This is not the same thing as a live query. A stream iterates over one query execution. A live query stays open and continues reacting to future changes.

### Example

```js
for await (const row of await db.stream(`
  SELECT id, email
  FROM users
  ORDER BY id
`)) {
  console.log(row);
}
```

## `db.transaction()`

`transaction(cb)` creates an explicit transactional scope.

```js
await db.transaction(async (tx) => {
  // do multiple things atomically
});
```

If the callback resolves, LinkedQL commits. If it throws, LinkedQL rolls back.

The callback shape is stable across runtimes, but the transaction object `tx` itself is runtime-specific.

### Mainstream database example

```js
await db.transaction(async (tx) => {
  await db.query(
    'INSERT INTO users (id, name) VALUES ($1, $2)',
    { values: [1, 'Ada'], tx }
  );

  await db.query(
    'UPDATE users SET active = true WHERE id = $1',
    { values: [1], tx }
  );
});
```

### FlashQL example

FlashQL works the same as above. But it additionally exposes DDL and DML methods on `tx` object itself:

```js
await flash.transaction(async (tx) => {
  const table = tx.getTable({ namespace: 'public', name: 'users' });
  await table.insert({ id: 1, name: 'Ada' });
});
```

This is the same transactional scope, but with FlashQL's lower-level transaction surface available directly on `tx`.

### Transaction rules worth knowing

- if the callback resolves, LinkedQL commits
- if the callback throws, LinkedQL rolls back and re-throws
- live queries are not supported inside explicit transactions

## `db.wal.subscribe()`

`db.wal.subscribe()` is LinkedQL's table-level changefeed API.

Use it when you care about table mutations directly rather than about a query result.

### Minimal form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

This subscribes to table-level commits without filtering.

### Filtered form

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users', 'orders'] },
  (commit) => {
    console.log(commit.entries);
  }
);
```

This narrows the feed to the selected relations.

### Stable subscription slots

You can also attach an id to a subscription:

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => {
    console.log(commit);
  },
  { id: 'users_slot' }
);
```

That id is more than a label. It gives the subscription a durable slot identity, and LinkedQL binds that subscription to the same slot each time it is recreated with the same id.

With that slot identity, the runtime:

- resumes from the same logical slot
- catches up on commits that were missed while the subscriber was away
- avoids treating every reconnect as a brand-new subscription

That matters when changefeeds back application caches, replicas, sync workers, or long-lived UI sessions that must continue from a known point rather than restarting blindly from "now."

To drop the slot itself, pass `{ forget: true }` to the `unsubscribe()` call:

```js
await unsubscribe({ forget: true });
```

### What commit objects contain

At minimum, table-level commits contain entries that tell you:

- which relation changed
- what operation happened
- the old and new row image where applicable

This is the right layer when you want raw mutation visibility and intend to build your own projection, cache, or replication logic.

## One contract, multiple layers

LinkedQL keeps the way you talk to data stable even when the place where the data lives changes.

Richer layers such as live queries, FlashQL orchestration, federation, and sync build on top of that contract.

Continue with:

- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)
- [Streaming](/capabilities/streaming)
- [FlashQL](/flashql)
