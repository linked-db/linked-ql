# FlashQL Language Reference

This page documents FlashQL's current SQL surface as it exists in the codebase today.

It is intentionally written as a usage reference, not as a speculative wishlist. Where support is partial or runtime-specific, that is stated plainly.

Two framing points matter before anything else:

- FlashQL speaks real SQL in PostgreSQL and MySQL flavors
- FlashQL also adds LinkedQL-specific syntax such as DeepRefs and version binding

Just as important is what this page is *not* saying:

- it does not claim full PostgreSQL or full MySQL compatibility
- it does not treat every parsed construct as fully supported at runtime
- it does not treat storage-transaction APIs as identical to SQL DDL support

## Reading this page

Use this page in three ways:

- as a map of what statement families are already strong
- as a guide to FlashQL-specific language additions
- as a companion to the deeper capability docs

For more focused guides, also see:

- [DeepRefs](/capabilities/deeprefs)
- [JSON Literals](/capabilities/json-literals)
- [UPSERT](/capabilities/upsert)
- [Version Binding](/capabilities/version-binding)

## Query language at a glance

FlashQL is strongest today in the application-facing query layer:

- `SELECT`
- `INSERT`
- `UPDATE`
- `DELETE`
- `RETURNING`
- `WITH` / CTEs
- joins, including `LATERAL`
- `VALUES`
- set-returning functions and `ROWS FROM`
- set operations such as `UNION`, `INTERSECT`, and `EXCEPT`
- window-function expressions used in tested execution paths

These are not just parser-level claims. They are exercised across the parser, desugaring layer, and engine tests.

## DQL: querying data

### Basic `SELECT`

```js
const result = await db.query(`
  SELECT id, name
  FROM public.users
  WHERE active = true
  ORDER BY id
`);
```

Supported common building blocks include:

- projection and aliases
- `WHERE`
- `ORDER BY`
- `LIMIT` / `OFFSET`
- grouping and aggregates
- subqueries

### Joins

FlashQL supports the mainstream join family:

- `INNER JOIN`
- `LEFT JOIN`
- `RIGHT JOIN`
- `CROSS JOIN`

And it also supports `LATERAL` joins in tested paths.

```js
const result = await db.query(`
  SELECT t.id, s.val
  FROM public.t_nums t
  CROSS JOIN LATERAL generate_series(1, t.n) AS s(val)
  ORDER BY t.id, s.val
`);
```

```js
const result = await db.query(`
  SELECT t.id, s.val
  FROM public.t_nums t
  LEFT JOIN LATERAL generate_series(1, t.n) AS s(val) ON true
  ORDER BY t.id, s.val
`);
```

### `VALUES` and derived row sets

```js
const result = await db.query(`
  SELECT *
  FROM (VALUES (1, 'Ada'), (2, 'Linus')) AS v(id, name)
  ORDER BY id
`);
```

This is useful when:

- you need a tiny inline dataset
- you want to join query data against app-supplied rows
- you are composing more advanced CTE pipelines

### Set-returning functions and `ROWS FROM`

FlashQL parses and executes tested forms such as:

```js
const result = await db.query(`
  SELECT *
  FROM ROWS FROM (
    generate_series(1, 2),
    unnest(ARRAY['a','b'])
  ) AS t(c1, c2)
`);
```

This matters because FlashQL is not restricted to base tables. It can treat function output as relational input.

### Set operations

Supported and tested:

- `UNION`
- `UNION ALL`
- `INTERSECT`
- `EXCEPT`

```js
const result = await db.query(`
  SELECT id FROM public.a
  UNION ALL
  SELECT id FROM public.b
`);
```

### CTEs

Common table expressions are an important part of FlashQL's usable language surface.

```js
const result = await db.query(`
  WITH active_users AS (
    SELECT id, name
    FROM public.users
    WHERE active = true
  )
  SELECT *
  FROM active_users
  ORDER BY id
`);
```

Writable CTE pipelines are also part of the tested surface when combined with `RETURNING`.

## DML: writing data

### `INSERT`

```js
await db.query(`
  INSERT INTO public.users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus')
`);
```

Common tested forms include:

- single-row insert
- multi-row insert
- `DEFAULT VALUES`
- `INSERT ... RETURNING`

### `UPDATE`

```js
await db.query(`
  UPDATE public.users
  SET name = 'Ada Lovelace'
  WHERE id = 1
`);
```

Tested forms include:

- regular `SET` expressions
- `UPDATE ... FROM`
- `UPDATE ... RETURNING`

### `DELETE`

```js
await db.query(`
  DELETE FROM public.users
  WHERE id = 1
  RETURNING *
`);
```

Tested forms include:

- regular conditional deletes
- `DELETE ... USING`
- `DELETE ... RETURNING`

### `RETURNING`

`RETURNING` is a major part of the FlashQL ergonomics story.

It supports:

- `RETURNING *`
- named columns
- aliases
- expressions
- function calls
- subqueries

```js
const result = await db.query(`
  INSERT INTO public.returning_demo (id, val)
  VALUES (1, 'x')
  RETURNING id * 10 AS id_times_10, upper(val) AS upper_val
`);
```

### UPSERT

FlashQL supports PostgreSQL-style `INSERT ... ON CONFLICT`.

```js
const result = await db.query(`
  INSERT INTO public.users (id, name, age)
  VALUES (30, 'SamX', 41)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, age = EXCLUDED.age
  RETURNING *
`);
```

See also: [UPSERT](/capabilities/upsert)

## Window functions

Window functions are part of the parser surface and are exercised in engine tests for tested shapes such as:

- `ROW_NUMBER() OVER (...)`
- `SUM(amount) OVER ()`
- `RANK() OVER (...)`

```js
const result = await db.query(`
  WITH changed AS (
    UPDATE public.returning_demo
    SET val = 'y'
    WHERE id = 1
    RETURNING id, val
  )
  SELECT
    id,
    val,
    ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM changed
`);
```

This is one of the areas where the older docs were badly behind the code. Window-function support is not merely "planned."

## DDL and schema operations

FlashQL now exposes a meaningful SQL DDL surface alongside the lower-level storage transaction APIs.

### Supported today

At the SQL-facing level, tested and used support includes:

- `CREATE SCHEMA ... WITH (...)`
- `ALTER SCHEMA`
- `CREATE TABLE`
- `ALTER TABLE`
- `DROP TABLE`
- `CREATE [ORIGIN|MATERIALIZED|REALTIME] VIEW`
- `ALTER VIEW`
- `DROP VIEW`
- `REFRESH VIEW`
- `CREATE INDEX`
- `ALTER INDEX`
- `DROP INDEX`

At the storage-transaction level, support exists for:

- `createTable()`
- `alterTable()`
- `dropTable()`
- `createView()`
- `alterView()`
- `dropView()`
- `createNamespace()`
- `alterNamespace()`
- `createIndex()`
- `alterIndex()`
- `dropIndex()`

### Important nuance about dialects

The SQL surface is intentionally selective rather than claiming full PostgreSQL or MySQL DDL parity. The parser is dialect-aware and covers the supported overlap plus FlashQL-specific extensions such as:

- schema options like `replication_origin`
- persistence-qualified views such as `CREATE MATERIALIZED VIEW` and `CREATE REALTIME VIEW`

If your application depends on rarely used server-specific DDL clauses, validate those paths explicitly.

## Transactions

FlashQL supports transactions at the client API level:

```js
await db.transaction(async (tx) => {
  const users = tx.getTable({ namespace: 'public', name: 'users' });
  await users.insert({ id: 1, name: 'Ada' });
});
```

That is the supported application-facing transaction model today.

This does **not** mean the SQL command family:

- `BEGIN`
- `COMMIT`
- `ROLLBACK`

should be read as the primary way to control transactions in FlashQL. The JS transaction API is the intended surface.

## JSON literals and structured data

FlashQL extends SQL with native JSON-style literals.

See:

- [JSON Literals](/capabilities/json-literals)

This matters especially when you want application-shaped SQL without constantly escaping back into imperative JavaScript.

## DeepRefs

DeepRefs are a LinkedQL language extension for relational traversal and structured writes.

Operators include:

- `~>` for forward traversal
- `<~` for reverse traversal

Example:

```sql
SELECT title, author ~> name
FROM public.posts
```

DeepRefs also show up in write syntax and desugaring workflows.

See: [DeepRefs](/capabilities/deeprefs)

## Version binding

FlashQL supports version-qualified relation references such as:

```sql
SELECT *
FROM public.users@=3
```

And in joins:

```sql
SELECT a.id, b.name
FROM public.vja@=1 a
LEFT JOIN public.vjb@=1 b ON a.rel = b.id
```

What version binding means here:

- the query states the relation version it expects
- if the stored relation version does not satisfy that expectation, the query fails

What it does **not** mean:

- it is not the same thing as historical row snapshotting

For point-in-time replay, use FlashQL boot options such as `versionStop`.

See: [Version Binding](/capabilities/version-binding)

## Point-in-time replay

Point-in-time replay is not a query operator. It is a FlashQL boot mode.

```js
const historical = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
});

await historical.connect();
```

This replays persisted history to a chosen relation-version boundary and boots the engine there.

That is separate from version binding inside a query.

## Dialect notes

### PostgreSQL flavor

This is the strongest and most fully exercised dialect path today.

Particularly strong areas include:

- `RETURNING`
- `ON CONFLICT`
- `ROWS FROM`
- `LATERAL`
- version binding
- many parser and execution tests

### MySQL flavor

MySQL-flavored parsing is supported, and FlashQL can switch dialect per client or per query. But the broadest execution coverage still centers on PostgreSQL-style usage.

That does not make MySQL support fake. It just means readers should calibrate expectations correctly.

## Practical reading of "support"

When evaluating whether FlashQL supports a given language feature, use this order of confidence:

1. feature is exercised by parser, desugaring, and engine tests
2. feature is exercised at least by parser and engine tests
3. feature parses but is not yet documented here as runtime-stable

That is why this page focuses on the features that are clearly alive in the current codebase rather than pretending every parsed form has equal runtime maturity.

## Where to go next

- [Query Interface](/docs/query-api)
- [DeepRefs](/capabilities/deeprefs)
- [JSON Literals](/capabilities/json-literals)
- [Version Binding](/capabilities/version-binding)
