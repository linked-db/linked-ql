# Structured Writes

Structured writes are one of LinkedQL's most application-oriented language features.

They let you express relationship-aware writes directly in SQL-shaped DML instead of splitting the operation across:

- multiple imperative inserts
- foreign-key bookkeeping
- extra query-roundtrips just to wire ids together

The key idea is that DeepRef syntax is not just for reading. It can also appear in write targets.

## The core idea

A regular insert target looks like this:

```sql
INSERT INTO public.users (id, email)
VALUES (1, 'ada@example.com')
```

A structured write target can include relational paths:

```sql
INSERT INTO public.users
  (email, parent_user1 ~> (id, email))
VALUES
  ('ada@example.com', ROW (50, 'parent@example.com'))
```

That tells LinkedQL:

- insert a row into `public.users`
- also ensure the related `parent_user1` payload is written
- wire the relationship through the appropriate key path

## Why this exists

Without structured writes, relationship-aware writes usually move into application code:

1. insert one row
2. collect its id
3. insert another row
4. collect another id
5. update the linking row

Structured writes let the query itself describe that intent.

## Example: forward relationship payload in `INSERT`

```sql
INSERT INTO public.users
  (email, parent_user1 ~> (id, email))
VALUES
  ('ada@example.com', ROW (50, 'parent@example.com'))
```

How to read it:

- `parent_user1` is a relationship-bearing column
- `~> (id, email)` describes fields to write through that relationship
- `ROW (...)` supplies the payload for the related row shape

## Example: nested forward traversal

Structured writes can compose through multiple hops.

```sql
INSERT INTO public.users
  (email, parent_user1 ~> parent_user1 ~> (id, email))
VALUES
  ('ada@example.com', ROW (50, 'root@example.com'))
```

This is the kind of write that becomes very tedious in imperative application code.

## Example: reverse traversal in writes

Reverse traversal is also part of the model.

```sql
INSERT INTO public.users
  (email, (parent_user2 <~ users) ~> (id, email))
VALUES
  ('ada@example.com', ROW (50, 'child@example.com'))
```

Here, the target path is describing a dependent relationship from the opposite direction.

## Example: structured `UPDATE`

Structured writes are not limited to inserts.

```sql
UPDATE public.users AS u
SET
  (username, parent_user1 ~> id) = ROW (232, 3445)
WHERE u.id = 1
```

This tells LinkedQL that the update affects:

- a direct column on the current row
- and a related value reachable through `parent_user1`

## What happens internally

Structured writes are not executed as magic. They are desugared into lower-level SQL plans.

That usually involves combinations of:

- CTEs
- `INSERT ... RETURNING`
- `UPDATE`
- row-number bookkeeping to keep row-to-row correspondence stable

This is why the feature belongs in the language and desugaring layer, not just in a helper library.

## Relationship to DeepRefs

Structured writes build directly on [DeepRefs](/capabilities/deeprefs).

The rough rule is:

- DeepRefs in `SELECT` help you traverse and shape reads
- DeepRefs in DML targets help you traverse and shape writes

## Relationship to UPSERT

Structured writes can also combine with PostgreSQL-style upsert flows.

That matters in real applications because "insert related data if absent, otherwise update it" is one of the most common sources of verbose application-side glue.

See also: [UPSERT](/capabilities/upsert)

## Current practical guidance

Because structured writes are powerful and nuanced, use this approach:

- start with one-hop writes first
- then move to nested paths
- prefer shapes that clearly mirror your relational model
- validate complex write flows against your schema and tests

This is one of the richest parts of the language surface, and also one of the places where precise examples matter most.

## Related docs

- [DeepRefs](/capabilities/deeprefs)
- [FlashQL Language Reference](/flashql/lang)
- [UPSERT](/capabilities/upsert)
