# UPSERT

*Do upserts with a literal `UPSERT` statement.*

```sql
UPSERT INTO users (name, email)
VALUES ('Jane', 'jane@example.com');
```

It’s identical in form to `INSERT`, but performs **update-on-conflict** automatically using your schema’s defined unique or primary keys.

## Overview

An **UPSERT** operation is an `INSERT` that automatically becomes an `UPDATE`
when the inserted data matches an existing record by a unique or primary key.

Traditionally, this behavior requires dialect-specific conflict clauses:

```sql
-- PostgreSQL
INSERT INTO users (name, email)
VALUES ('Jane', 'jane@example.com')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- MySQL
INSERT INTO users (name, email)
VALUES ('Jane', 'jane@example.com')
ON DUPLICATE KEY UPDATE name = VALUES(name);
```

LinkedQL collapses that into one statement:

```sql
UPSERT INTO users (name, email)
VALUES ('Jane', 'jane@example.com');
```

No conflict clause. No manual key specification.
LinkedQL infers everything directly from your schema.

## Basic Syntax

`UPSERT` shares the exact same syntax as `INSERT`:

```sql
UPSERT INTO table_name (col1, col2, ...)
VALUES (val1, val2, ...);
```

Just replace the keyword `INSERT` with `UPSERT`.
All column and value rules remain identical — including multi-row inserts.

`UPSERT` statements **must not** include explicit conflict clauses such as
`ON CONFLICT` (PostgreSQL) or `ON DUPLICATE KEY` (MySQL);
LinkedQL generates these internally.

## How It Works

LinkedQL already knows your schema — it draws on that here.

### Dialect-Aware Conflict Handling

At compile time, LinkedQL rewrites an `UPSERT` into a dialect-appropriate `INSERT`
with its conflict clause automatically generated.

**PostgreSQL (expanded):**

```sql
INSERT INTO users (name, email)
VALUES ('Jane', 'jane@example.com')
ON CONFLICT (email)
DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email;
```

**MySQL (expanded):**

```sql
INSERT INTO users (name, email)
VALUES ('Jane', 'jane@example.com')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  email = VALUES(email);
```

Each target column is paired with an assignment expression for the update step.
The compiler handles clause construction and dialect differences automatically.

### Unique Key Resolution (PostgreSQL)

Before emitting PostgreSQL SQL, LinkedQL inspects the table schema to determine which **unique** or **primary key** constraint should serve as the conflict target.
MySQL requires no such step — its `ON DUPLICATE KEY UPDATE` clause automatically uses all defined keys.

LinkedQL’s selection process is schema-driven:

1. It enumerates all primary and unique key constraints on the target table.
2. If multiple exist, it picks the first whose columns appear among the columns being upserted.
3. If none overlap, it falls back to the first available unique or primary key.
4. If no unique or primary keys are defined, compilation fails with a clear error:

   > “Table `users` has no unique or primary keys defined to process an UPSERT operation.”

This ensures deterministic, schema-aware conflict resolution for PostgreSQL.

## Appendix A — Notes & Constraints

* Multi-row inserts are fully supported.
* In PostgreSQL, the target table must define at least one **unique** or **primary key** constraint.
