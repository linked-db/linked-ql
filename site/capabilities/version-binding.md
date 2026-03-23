# Version Binding

*Bind a query to the relation versions it was written against.*

```sql
SELECT *
FROM public.users@=3;
```

```sql
SELECT
  u.id,
  p.title
FROM public.users@=3 AS u
LEFT JOIN public.posts@=5 AS p
  ON p.author_id = u.id;
```

## Status

This page is currently a stub.

It exists so the README and docs can point to a dedicated home for:

* relation version specs such as `@=`, `@<`, `@>`, `@<=`, `@>=`
* how version binding differs from point-in-time replay
* join safety and schema contracts
* FlashQL-specific support details

## For now

See these pages while this guide is being expanded:

* [FlashQL Overview](/flashql)
* [Language Reference](/flashql/lang)

