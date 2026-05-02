# FlashQL Language Reference

This page documents FlashQL's current SQL surface as it exists in the codebase today.

It is intentionally written as a usage reference. Also, where support is partial or runtime-specific, that is stated plainly.

---

## Query Language at a Glance

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

---

## DQL: Querying Data

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

### `VALUES` and Derived Row Sets

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

### Set-Returning Functions and `ROWS FROM`

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

### Set Operations

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

---

## DML: Writing Data

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
- `INSERT ... SELECT`
- `INSERT ... DEFAULT VALUES`
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
- DeepRefs

```js
const result = await db.query(`
  INSERT INTO public.returning_demo (id, val)
  VALUES (1, 'x')
  RETURNING id * 10 AS id_times_10, upper(val) AS upper_val
`);
```

### UPSERT

FlashQL supports `INSERT ... ON CONFLICT` operations.

```js
const result = await db.query(`
  INSERT INTO public.users (id, name, age)
  VALUES (30, 'SamX', 41)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, age = EXCLUDED.age
  RETURNING *
`);
```

See also: [UPSERT](/lang/upsert)

---

## Window Functions

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

---

## DDL and Schema Operations

FlashQL now exposes a meaningful SQL DDL surface alongside the lower-level storage transaction APIs.

### Supported Today

At the SQL-facing level, tested and used support includes:

- `CREATE SCHEMA ... WITH (...)`
- `ALTER SCHEMA`
- `CREATE TABLE`
- `ALTER TABLE`
- `DROP TABLE`
- `CREATE VIEW`
- `CREATE MATERIALIZED VIEW`
- `CREATE REALTIME VIEW`
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

### Important Nuance About Dialects

The SQL surface is intentionally selective rather than claiming full PostgreSQL or MySQL DDL parity. The parser is dialect-aware and covers the supported overlap plus FlashQL-specific extensions.

If your application depends on rarely used server-specific DDL clauses, validate those paths explicitly.

---

## JSON Literals and Structured Data

FlashQL extends SQL with native JSON-style literals.

See:

- [JSON Literals](/lang/json-literals)

This matters especially when you want application-shaped SQL without constantly escaping back into imperative JavaScript.

---

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

See: [DeepRefs](/lang/deeprefs)

---

## Version Binding

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

See: [Version Binding](/lang/version-binding)

---

## Point-in-Time Replay

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

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the broader LinkedQL language surface | [Language Surface](/lang) |
| the common API contract | [Core API](/api) |
