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

---

## `db.query()`

`db.query()` is the primary method for executing SQL statements.

It supports several invocation forms.

### Signatures

```ts
db.query(sql: string): Promise<Result>
db.query(sql: string, options: QueryOptions): Promise<Result>
db.query(sql: string, values: any[]): Promise<Result>
db.query(sql: string, callback: Function, options: QueryOptions): Promise<RealtimeResult>
db.query(queryLike: { query: string; ... }): Promise<Result>
db.query(queryLike: { text: string; ... }): Promise<Result>
```

### General Behavior

`db.query()`:

- executes the provided SQL text
- accepts parameters either positionally or through `options.values`
- accepts runtime options such as `dialect`, `live`, `signal`, `id`, or `tx`
- returns either a `Result` or, for live queries, a `RealtimeResult`

### Two Execution Modes

`db.query()` operates in two distinct modes:

1. **one-shot mode** → returns a `Result` object
2. **live mode** (`{ live: true }`) → returns a `RealtimeResult` object

Here, `{ live: true }` is not just a flag — it changes the lifecycle of the query:

| Mode     | Lifecycle                          | Result type      |
| -------- | ---------------------------------- | ---------------- |
| one-shot | executes and completes             | `Result`         |
| live     | stays active and updates over time | `RealtimeResult` |

Examples demonstrate both modes.

### Examples

#### Basic Query Execution

```js
const result = await db.query('SELECT * FROM users');
```

This executes the query and buffers the full result set into `result.rows`.

#### Parameterized Query

Parameters as a second argument:

```js
const result = await db.query('SELECT * FROM users WHERE active = $1', [true]);
```

> This is the same query API, with positional parameters.

#### Query With Options

Parameters through `options.values`:

```js
const result = await db.query('SELECT * FROM users WHERE created_at >= $1', {
  values: [new Date('2026-01-01')],
});
```

Live query form:

```js
const result = await db.query('SELECT id, title FROM posts ORDER BY id', { live: true });
```

> This form keeps values and other options in one object.

In live mode, the query stays open and `result.rows` becomes a live view.

#### Query With a Callback

A live query can pass a callback for direct commit events handling:

```js
const commits = [];

const result = await db.query(
  'SELECT id, title FROM posts ORDER BY id',
  (commit) => commits.push(commit),
  { live: true }
);
```

The callback form importantly changes the delivery model:

- `result.rows` carries the initial result set and remains static
- subsequent updates are emitted to the callback as commit events

In other words, the callback form is the commit-stream interface, not the self-updating `rows` interface.

---

## `Result`

`Result` represents the outcome of a regular query.

All non-live `query()` operations return a `Result` object that can contain both row data and write metadata, though only one of those is meaningful for a given statement.

### Properties

| Property | Type | Description |
| :-- | :-- | :-- |
| `rows` | `any[]` | Result set as an array of row objects |
| `rowCount` | `number` | Number of rows affected by a non-returning write |
| `affectedRows` | `number` | Alias of `rowCount`, useful for MySQL/MariaDB-style code |

### Reading `Result` Correctly

While `rows` and `rowCount` may sound alike, `rowCount` is not the number of returned rows.

It is instead the number of rows affected by an `INSERT`, `UPDATE`, or `DELETE` that does not itself return rows.

Quick reference:

| Operation | Returns `rows` | Affects `rowCount` |
| :-- | :-- | :-- |
| `SELECT` | yes | no |
| `INSERT/UPDATE/DELETE ... RETURNING` | yes | no |
| `INSERT/UPDATE/DELETE` | no | yes |

### Examples

#### A Fetch Operation

```js
const result = await db.query('SELECT id, name FROM users');
console.log(result.rows);
// [{ id: 1, name: 'Ada' }]
console.log(result.rowCount);
// 0 – not applicable to this query
```

> `rowCount` stays `0` here because this is a read query. The returned rows live in `result.rows`.

#### A Write Operation With `RETURNING`

```js
const result = await db.query(
  'INSERT INTO users (name) VALUES ($1) RETURNING *',
  ['Bob']
);
console.log(result.rows);
// [{ id: 2, name: 'Bob' }]
console.log(result.rowCount);
// 0 – not applicable to this query
```

> the `RETURNING` clause turns the write into a result-set query, so the inserted rows come back in `rows`.

#### A Write Operation Without `RETURNING`

```js
const result = await db.query(
  'INSERT INTO users (name) VALUES ($1)',
  ['Eve']
);
console.log(result.rowCount);
// 1
console.log(result.rows);
// [] – not applicable to this query
```

> Without `RETURNING`, the write reports through `rowCount` instead.

---

## `RealtimeResult`

`RealtimeResult` is the result of a [live query](/capabilities/live-queries): a query executed with `{ live: true }`.

It extends the ordinary idea of a `Result` into a live, self-updating result.

### Properties

| Property | Type | Description |
| :-- | :-- | :-- |
| `rows` | `any[]` | Result rows for the `RealtimeResult`; in non-callback live mode this is the self-updating live view, while in callback mode it carries the initial result set |
| `hashes` | `string[]` | Internal row identifiers used for diff tracking |
| `mode` | `string` | Delivery mode: `'live'` or `'callback'` – when a callback is passed |
| `initial` | `boolean` | Indicates whether this query produced a fresh initial result or resumed from an existing subscription slot. Resumption happens when you re-issue a query with the same [`id`](#stable-subscription-slots). Explicitly passing `initial: false` with the query also results in no initial result. |

> [!IMPORTANT]
> Treat `rows` and `hashes` as read-only. Manual mutation can desynchronize the internal state that keeps the live result coherent.

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
- in callback mode, `rows` is the initial result and later updates arrive as commit events

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

### Observing Mutations

Because live rows are implemented through the [Observer](https://github.com/webqit/observer) protocol, they can be observed like any other objects:

```js
import { Observer } from '@webqit/observer';

Observer.observe(result.rows, (mutations) => {
  console.log(mutations);
});

Observer.observe(result.rows, Observer.subtree(), (mutations) => {
  console.log(mutations);
});
```

This exposes the mutations applied to the live result as it changes over time.

At root level, you observe row additions and removals. With `Observer.subtree()`, you also observe field-level changes inside the view.

---

## `db.stream()`

`stream()` is the lazy, pull-based alternative to `query()`.

Use it when:

- the result may be large
- you do not want all rows buffered into memory first
- you want `for await ... of` iteration

This is not the same thing as a live query. A stream iterates over one query execution. A live query stays open and continuesly reacts to future changes.

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

---

## `db.transaction()`

`transaction(cb)` creates an explicit transactional scope.

```js
await db.transaction(async (tx) => {
  // do multiple things atomically
});
```

If the callback resolves, LinkedQL commits. If it throws, LinkedQL rolls back.

The callback shape is stable across runtimes, but the transaction object `tx` itself is runtime-specific.

### Mainstream Database Example

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

### FlashQL Example

FlashQL works the same as above. But it additionally exposes DDL and DML methods on `tx` object itself:

```js
await flash.transaction(async (tx) => {
  const table = tx.getTable({ namespace: 'public', name: 'users' });
  await table.insert({ id: 1, name: 'Ada' });
});
```

This is the same transactional scope, but with FlashQL's lower-level transaction surface available directly on `tx`.

### Transaction Rules Worth Knowing

- if the callback resolves, LinkedQL commits
- if the callback throws, LinkedQL rolls back and re-throws
- live queries are not supported inside explicit transactions

---

## `db.wal.subscribe()`

`db.wal.subscribe()` is LinkedQL's table-level change-stream subscription API.

Use it when you care about table mutations directly rather than about a query result.

### Minimal Form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

This subscribes to table-level commits without filtering.

### Filtered Form

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users', 'orders'] },
  (commit) => {
    console.log(commit.entries);
  }
);
```

This narrows the feed to the selected relations.

### Documentation

See the [Changefeeds](/capabilities/changefeeds) document for details

---

## One Contract, Multiple Layers

LinkedQL keeps the way you talk to data stable even when the place where the data lives changes.

Richer layers such as live queries, FlashQL orchestration, federation, and sync build on top of that contract.

Continue with:

- [Live Queries](/capabilities/live-queries)
- [Changefeeds](/capabilities/changefeeds)
- [Streaming](/capabilities/streaming)
- [FlashQL](/flashql)
