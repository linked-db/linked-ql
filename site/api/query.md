# `db.query()`

`db.query()` is the primary method for executing SQL statements.

It supports several invocation forms.

---

## Signatures

```ts
db.query(sql: string): Promise<Result>
db.query(sql: string, options: QueryOptions): Promise<Result>
db.query(sql: string, values: any[]): Promise<Result>
db.query(sql: string, callback: Function, options: QueryOptions): Promise<RealtimeResult>
db.query(queryLike: { query: string; ... }): Promise<Result>
db.query(queryLike: { text: string; ... }): Promise<Result>
```

---

## General Behavior

`db.query()`:

- executes the provided SQL text
- accepts parameters either positionally or through `options.values`
- accepts runtime options such as `dialect`, `live`, `signal`, `id`, or `tx`
- returns either a `Result` or, for [live queries](/realtime/live-queries), a `RealtimeResult`

---

## Two Execution Modes

`db.query()` operates in two distinct modes:

1. one-shot mode returning a `Result`
2. live mode with `{ live: true }` returning a `RealtimeResult`

Here, `{ live: true }` is not just a flag. It changes the lifecycle of the query:

| Mode | Lifecycle | Result type |
| :-- | :-- | :-- |
| one-shot | executes and completes | `Result` |
| live | stays active and updates over time | `RealtimeResult` |

---

## Examples

### Basic Query Execution

```js
const result = await db.query('SELECT * FROM users');
```

This executes the query and buffers the full result set into `result.rows`.

### Parameterized Query

Parameters as a second argument:

```js
const result = await db.query('SELECT * FROM users WHERE active = $1', [true]);
```

### Query With Options

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

In live mode, the query stays open and `result.rows` becomes a live result set.

### Query With a Callback

A live query can pass a callback for direct commit-events handling:

```js
const commits = [];

const result = await db.query(
  'SELECT id, title FROM posts ORDER BY id',
  (commit) => commits.push(commit),
  { live: true }
);
```

The callback form changes the delivery model:

- `result.rows` carries the initial result set and remains static
- subsequent updates are emitted to the callback as commit events

---

## `Result`

`Result` represents the outcome of a regular query.

All non-live `query()` operations return a `Result` object that can contain both row data and write metadata, though only one of those is meaningful for a given statement.

### Properties

| Property | Type | Description |
| :-- | :-- | :-- |
| `rows` | `any[]` | result set as an array of row objects |
| `rowCount` | `number` | number of rows affected by a non-returning write |
| `affectedRows` | `number` | alias of `rowCount`, useful for MySQL/MariaDB-style code |

### Reading `Result` Correctly

`rowCount` is not the number of returned rows.

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
// 0 – not applicable to the query
```

#### A Write Operation With `RETURNING`

```js
const result = await db.query(
  'INSERT INTO users (name) VALUES ($1) RETURNING *',
  ['Bob']
);
console.log(result.rows);
// [{ id: 2, name: 'Bob' }]
console.log(result.rowCount);
// 0 – not applicable to the query
```

#### A Write Operation Without `RETURNING`

```js
const result = await db.query(
  'INSERT INTO users (name) VALUES ($1)',
  ['Eve']
);
console.log(result.rowCount);
// 1
console.log(result.rows);
// [] – not applicable to the query
```

---

## `RealtimeResult`

`RealtimeResult` is the result of a [live query](/realtime/live-queries): a query executed with `{ live: true }`.

It extends the ordinary idea of a `Result` into a live, self-updating result.

### Properties

| Property | Type | Description |
| :-- | :-- | :-- |
| `rows` | `any[]` | result rows; in non-callback live mode this is the self-updating live view, while in callback mode it carries the initial result set |
| `hashes` | `string[]` | internal row identifiers used for diff tracking |
| `mode` | `string` | delivery mode: `'live'` or `'callback'` |
| `initial` | `boolean` | indicates whether this query produced a fresh initial result or [resumed from an existing subscription slot](/realtime/live-queries#stable-subscription-slots) |

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

### Example

```js
const result = await db.query(
  'SELECT id, name FROM users ORDER BY id',
  { live: true }
);

console.log(result.rows);
console.log(result.mode);

await result.abort();
```

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the related `stream()` API | [Query API](/api/stream) |
| live queries in detail | [Live Queries](/realtime/live-queries) |
| querying within a transaction | [Transaction API](/api/transaction) |
