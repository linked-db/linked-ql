# Structured Writes

*Express relationship-aware writes directly in SQL-shaped DML.*

```sql
INSERT INTO users
  (email, parent_user ~> (id, email))
VALUES
  ('ada@example.com', ROW (50, 'parent@example.com'));
```

## Status

This page is currently a stub.

It exists so the README and docs can point to a dedicated home for:

* relationship-aware `INSERT` and `UPDATE`
* DeepRef payloads in DML
* desugaring into lower-level SQL operations
* supported shapes and limitations

## For now

See these pages while this guide is being expanded:

* [DeepRefs](/capabilities/deeprefs)
* [JSON Literals](/capabilities/json-literals)
* [UPSERT](/capabilities/upsert)

