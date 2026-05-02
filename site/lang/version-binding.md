# Version Binding

_Explicitly bind queries to specific schema versions._

```sql
SELECT * FROM public.users@=3
```

> Only available currently in FlashQL. Comming soon to PostgreSQL, and MySQL/MariaDB

---

## Semver-Style Matching

Version binding uses semver-style matching semantics. What that means is that the matcher understands:

- exact matches like `@=3` or `@=3_4`
- comparison operators like `@>=2`
- compatible-range operators like `@^2_1`
- minor/patch range operators like `@~7_6`

Version parts may be written only with `_` as separator:

```sql
public.users@^2_1
public.users@3
public.users@3_4
```

The bare forms are range-like too:

- `@3` means "any `3.x.x` relation version"
- `@3_4` means "any `3.4.x` relation version"
- `@=3_4_1` means "exactly `3.4.1`"

---

## Join Example

Version binding becomes especially valuable when multiple relations participate in a query.

```sql
SELECT
  a.id,
  b.name
FROM public.vja@=1 AS a
LEFT JOIN public.vjb@=1 AS b
  ON a.rel = b.id
```

How to read this:

- the query expects `public.vja` at relation version `1`
- the query expects `public.vjb` at relation version `1`
- if either side no longer satisfies that contract, the query should not silently continue as if nothing changed

---

## Why Version Binding

Most schema drift bugs are painful because they fail too late:

- a query still parses
- a deployment still boots
- but the semantics the application assumed are no longer true

Version binding gives you a way to express:

> "This query is coupled to this relation version. If the storage side has moved, fail visibly."

---

## What Version Binding Is Not

Version binding is **not** the same thing as historical row snapshotting.

It does **not** mean:

- "show me the rows as they were when version 3 existed"

It means:

- "run this query only if the relation version assumptions are satisfied"

For historical replay, use FlashQL's point-in-time boot support with `versionStop`.

---

## FlashQL-Specific Support

Version binding is a FlashQL-oriented capability today because it depends on relation-version knowledge inside the local storage/runtime layer.

You will most commonly use it in:

- FlashQL queries
- FlashQL joins
- FlashQL historical/branching workflows

---

## Example: Bind and Then Boot Historically

```js
const db = new FlashQL({
  keyval,
  versionStop: 'public.snap_tbl@1',
});

await db.connect();

const result = await db.query(`
  SELECT id
  FROM public.snap_tbl@=1
  ORDER BY id
`);
```

In that shape:

- `versionStop` chooses the historical replay boundary
- `@=1` asserts the query's relation-version expectation

---

## When to Reach for Version Binding

Use it when:

- you care about schema/version safety more than silent compatibility
- you are building version-aware local apps on FlashQL
- you want joins to assert compatibility across multiple versioned relations

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| FlashQL-specific language surface | [FlashQL Language Surface](/flashql/lang) |
| the broader LinkedQL language surface | [Language Surface](/lang) |
