# Query Interface

LinkedQL provides a **unified query interface** consistent across all supported SQL dialects.
Each client exposes the same `query()` method, and returns the same `Result` object.

## `client.query()`

The primary query method for executing SQL statements.
Supports multiple invocation forms — string-only, parameterized, and option-based — for flexibility across drivers and runtimes.

### Signatures

```ts
client.query(sql: string): Promise<Result>
client.query(sql: string, values: any[]): Promise<Result>
client.query(sql: string, values: any[], options: QueryOptions): Promise<Result>
client.query(sql: string, options: QueryOptions): Promise<Result>
```

### Behavior

* Executes the provided SQL string against the connected database.
* Parameters can be passed as an array (`values`) or through `options.values`.
* Additional runtime options can control behavior (e.g., `{ live: true, cache: true }`).
* Returns a `Result` object (see below).

### Examples

#### Basic query execution

```js
const result = await client.query('SELECT * FROM users');
```

#### Parameterized query

```js
const result = await client.query(
  'SELECT * FROM users WHERE active = $1'
  [true]
);
```

#### Query with options

```js
const result = await client.query(
  'SELECT * FROM users WHERE created_at > $1',
  [new Date('2024-01-01')],
  { live: true }
);
```

#### Parameters via `options.values`

```js
const result = await client.query(
  'SELECT * FROM users WHERE name = $1',
  { values: ['John'], cache: true }
);
```

## `Result`

Represents the outcome of a query.
All `query()` operations return a `Result` object that includes both **row data** and **write metadata**, though only one is meaningful per query type.

### Properties**

| Property       | Type     | Description                                                                                                    |
| :------------- | :------- | :----------------------------------------------------------------------------------------------------- |
| `rows`         | `any[]`  | Result set as an array of row objects. Non-empty only for queries that return a result set.                    |
| `rowCount`     | `number` | Number of rows affected by write operations that do not return a result set. Always `0` for read-only queries. |
| `affectedRows` | `number` | Alias for `rowCount`, for MySQL/MariaDB parity.                                                        |


### Behavior

Note that while `rowCount` may sound like it, it is _never_ the number of rows returned in `rows`;
it is instead the number of rows affected by an `INSERT|UPDATE|DELETE` operation that itself has no `RETURNING` clause.
Quick reference table is:

| Operation                            | Returns `rows` | Affects `rowCount` |
| :----------------------------------- | :------------- | :----------------- |
| `SELECT`                             | ✅             | ❌                  |
| `INSERT/UPDATE/DELETE ... RETURNING` | ✅             | ❌                  |
| `INSERT/UPDATE/DELETE`               | ❌             | ✅                  |

### Examples

#### A fetch operation

```js
const result = await client.query('SELECT id, name FROM users');
console.log(result.rows); // [!code highlight]
// → [{ id: 1, name: 'Alice' }]
console.log(result.rowCount); // [!code warning]
// → 0
```

#### A write operation with RETURNING

```js
const result = await client.query(
  'INSERT INTO users (name) VALUES ($1) RETURNING *',
  ['Bob']
);
console.log(result.rows); // [!code highlight]
// → [{ id: 2, name: 'Bob' }]
console.log(result.rowCount); // [!code warning]
// → 0
```

#### A write operation without RETURNING

```js
const result = await client.query(
  'INSERT INTO users (name) VALUES ($1)',
  ['Eve']
);
console.log(result.rowCount); // [!code highlight]
// → 1
console.log(result.rows); // [!code warning]
// → []
```

## `RealtimeResult`

`RealtimeResult` is the result of a [live query](capabilities/realtime-sql) in LinkedQL — queries that execute with `{ live: true }`.
It extends [`Result`](#result) to represent a **live view** of query results — adding a small set of properties and methods that enable reactivity and lifecycle control..

### Own Properties

| Property | Type              | Description                                                                                                                                                                                                             |
| :------- | :---------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rows`   | `any[] (proxied)` | A **live view** of result set. This array is reactive — it mutates automatically as database changes are applied. It is to be treated as read-only; manual mutation can desynchronize internal state.                   |
| `hashes` | `string[]`        | Internal row identifiers used for diff tracking. Exposed for inspection only; must not be modified. Mutation of this array will corrupt the synchronization state.                                                      |

### Methods

#### `abort()`

Terminates the realtime subscription and stops further updates to the live view.

```js
result.abort();
```

### Behaviour

`RealtimeResult` is a self-updating version of `Result` that maintains its `rows` in sync with the underlying dataset as changes occur.
The `rows` array becomes static on abortion;
future changes from the underlying query aren't reflected.

### Examples

#### A live query

```js
// Executing a live query returns a RealtimeResult
const result = await client.query('SELECT * FROM users', { live: true });

// Access rows as a live view
setInterval(() => console.log(result.rows));

// Abort when no longer needed
result.abort();
```

#### Observing mutations

```js
// Observe changes (via @webqit/observer)
import Observer from '@webqit/observer';

Observer.observe(result.rows, changes => {
  console.log('Live updates:', changes);
});
```
