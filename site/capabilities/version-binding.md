# Version Binding

> Only available currently in FlashQL. Comming soon to PostgreSQL, and MySQL/MariaDB

Version binding lets a query state the relation versions it expects.

That makes it a schema-contract feature.

It is especially useful when:

- an application was written against a specific table version
- you want queries to fail fast when storage no longer matches that expectation
- you want joins to assert that both sides of the query still satisfy the version assumptions they were written against

## Basic Form

Version binding is attached directly to relation references:

```sql
SELECT *
FROM public.users@=3
```

That query is saying:

> "Run this query only if `public.users` satisfies the version spec `=3`."

## Version Spec Operators

Common forms include:

```sql
public.users@=3
public.users@<3
public.users@>4
public.users@<=3
public.users@>=4
public.users@=3_4
```

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

## Why Version Binding Exists

Most schema drift bugs are painful because they fail too late:

- a query still parses
- a deployment still boots
- but the semantics the application assumed are no longer true

Version binding gives you a way to express:

> "This query is coupled to this relation version. If the storage side has moved, fail visibly."

## What Version Binding Is Not

Version binding is **not** the same thing as historical row snapshotting.

It does **not** mean:

- "show me the rows as they were when version 3 existed"

It means:

- "run this query only if the relation version assumptions are satisfied"

For historical replay, use FlashQL's point-in-time boot support with `versionStop`.

## FlashQL-Specific Support

Version binding is a FlashQL-oriented capability today because it depends on relation-version knowledge inside the local storage/runtime layer.

You will most commonly use it in:

- FlashQL queries
- FlashQL joins
- FlashQL historical/branching workflows

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

## When to Reach for Version Binding

Use it when:

- you care about schema/version safety more than silent compatibility
- you are building version-aware local apps on FlashQL
- you want joins to assert compatibility across multiple versioned relations
