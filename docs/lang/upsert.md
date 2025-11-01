# ≫ UPSERT

*Do upserts with a literal `UPSERT` statement.*

```sql
UPSERT INTO users (name, email)
VALUES ('Jane', 'jane@example.com');
```

It’s identical in form to `INSERT`, but performs **update-on-conflict** automatically using your schema’s defined unique or primary keys.

## Table of Contents

<details open><summary>Show</summary>

* [Overview](#overview)
* [` 1 |` Basic Syntax](#-1--basic-syntax)
* [` 2 |` How It Works](#-2--how-it-works)

  * [`2.1 |` Dialect-Aware Conflict Handling](#21--dialect-aware-conflict-handling)
  * [`2.2 |` Unique Key Resolution (PostgreSQL)](#22--unique-key-resolution-postgresql)
* [Appendix A — Dialect Equivalents](#appendix-a--dialect-equivalents)
* [Appendix B — Notes & Constraints](#appendix-b--notes--constraints)

</details>

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

---

## ` 1 |` Basic Syntax

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

---

## ` 2 |` How It Works

LinkedQL already knows your schema — it draws on that here.

### `2.1 |` Dialect-Aware Conflict Handling

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

### `2.2 |` Unique Key Resolution (PostgreSQL)

Before emitting PostgreSQL SQL, LinkedQL inspects the table schema to determine which **unique** or **primary key** constraint should serve as the conflict target.
MySQL requires no such step — its `ON DUPLICATE KEY UPDATE` clause automatically uses all defined keys.

LinkedQL’s selection process is schema-driven:

1. It enumerates all primary and unique key constraints on the target table.
2. If multiple exist, it picks the first whose columns appear among the columns being upserted.
3. If none overlap, it falls back to the first available unique or primary key.
4. If no unique or primary keys are defined, compilation fails with a clear error:

   > “Table `users` has no unique or primary keys defined to process an UPSERT operation.”

This ensures deterministic, schema-aware conflict resolution for PostgreSQL.

---

## Appendix A — Dialect Equivalents

| LinkedQL Form                                  | PostgreSQL Equivalent                                                              | MySQL Equivalent                                                           |
| :--------------------------------------------- | :--------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| `UPSERT INTO users (name, email) VALUES (...)` | `INSERT INTO users (name, email) VALUES (...) ON CONFLICT (...) DO UPDATE SET ...` | `INSERT INTO users (name, email) VALUES (...) ON DUPLICATE KEY UPDATE ...` |
| Conflict clause                                | `ON CONFLICT (unique_key)`                                                         | `ON DUPLICATE KEY`                                                         |
| Update source                                  | `EXCLUDED.column`                                                                  | `VALUES(column)`                                                           |

---

## Appendix B — Notes & Constraints

* Multi-row inserts are fully supported.
* In PostgreSQL, the target table must define at least one **unique** or **primary key** constraint.
