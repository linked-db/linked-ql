---
title: "DeepRefs"
description: "LinkedQL’s Deep Reference operator (~>) — a first-class language feature for relational dereferencing in SQL."
permalink: /lang/deeprefs/
nav_order: 1
layout: page
---

# ≫ DeepRefs

_Follow relationships using simple arrow notation: `a ~> b`!_

SQL schemas already describe relationships —
`FOREIGN KEY (author) REFERENCES users (id)`

DeepRefs let you **traverse those foreign-key declarations directly**, inline, without writing a join.

```sql
SELECT author ~> name FROM posts
```

If you’ve declared a relationship, you can draw arrows on it.
LinkedQL automatically handles the mechanics and resolves them all from the schema catalog.

## Table of Contents

<details open><summary>Show</summary>

- [General Syntax](#general-syntax)
- [DeepRefs in Context](#deeprefs-in-context)

- [` 1 |` Projections](#-1--projections)
  - [`1.1 |` Projection Semantics](#11--projection-semantics)
    - [`1.1.1` DeepRefs (`~>`)](#111-deeprefs-)
    - [`1.1.2` BackRefs (`<~`)](#112-backrefs-)
  - [`1.2 |` Structural Projection](#12--structural-projection)
  - [`1.3 |` Projection Summary](#13--projection-summary)

- [` 2 |` Expressions](#-2--expressions)
  - [`2.1 |` Composability](#21--composability)
  - [`2.2 |` Structural Contexts](#22--structural-contexts)
  - [`2.3 |` Expression Summary](#23--expression-summary)

- [` 3 |` Mutations](#-3--mutations)
  - [`3.1 |` DeepRefs (`~>`)](#31--deeprefs-)
  - [`3.2 |` BackRefs (`<~`)](#32--backrefs-)
  - [`3.3 |` Nested and Mixed Chains](#33--nested-and-mixed-chains)
  - [`3.4 |` Default and Derived Sources](#34--default-and-derived-sources)
  - [`3.5 |` Upserts](#35--upserts)
    - [`3.5.1` Explicit Conditionals (Conflict-Handling)](#351-explicit-conditionals-conflict-handling)
  - [`3.6 |` Updates](#36--updates)
  - [`3.7 |` Deletes](#37--deletes)
  - [`3.8 |` Mutation Summary](#38--mutation-summary)

- [` 4 |` Foreign Key Scopes](#-4--foreign-key-scopes)
  - [`4.1 |` Foreign Key Projected from an Inner Query](#41--foreign-key-projected-from-an-inner-query)
  - [`4.2 |` Foreign Key Inherited from an Outer Query](#42--foreign-key-inherited-from-an-outer-query)
  - [`4.3 |` Scope Summary](#43--scope-summary)

- [Appendix A — Implied Schema and Dialect](#appendix-a--implied-schema-and-dialect)
  - [Default Dialect](#default-dialect)
  - [Reference Schema](#reference-schema)

</details>

## General Syntax

DeepRefs are path expressions. You use:

* **DeepRef (`~>`)** to walk *forward* along a foreign-key path (from the current row *A* to the referenced row *B*).
* **BackRef (`<~`)** to walk *backward* along the same path (from rows *B* that reference the current row *A*).

Essentially, DeepRefs and BackRefs mirror each other — one walks forward, the other walks back.

**_Example_**:

```sql
SELECT
  p.id,
  p.title,
  p.author ~> name AS author_name
FROM posts AS p;
```

The `~>` arrow means:

> “From this post, follow the `author` foreign key to the `users` table, then take the `name` column.”

### Quick Cheatsheet

| Type            | Syntax                    | Direction      | Meaning                                                                                                              | Example                                 |
| :-------------- | :------------------------ | :------------- | :------------------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| **DeepRef**     | `fk ~> col`               | forward        | From the current row (A), follow the foreign key `fk` to the referenced row (B) and read `B.col`.                    | `post.author ~> name`                   |
| **Multi-hop DeepRef** | `fk ~> fk2 ~> col`        | forward depth  | Follow multiple foreign key hops: `A.fk → B.fk2 → C.col`.                                                                | `comment.post ~> author ~> email`       |
| **BackRef**     | `(fk <~ T) ~> col`        | backward       | From the current row (A), find rows in table `T` whose foreign key `fk` points to A’s primary key; read their `col`. | `(author <~ posts) ~> title`            |
| **Multi-hop BackRef** | `(fk <~ fk2 <~ T) ~> col` | backward depth | Walk backward through multiple foreign key hops.                                               | `(author <~ posts <~ comments) ~> text` |

**_Legend_**:

* **A** — the *current row* (the table you’re selecting from)
* **B, C** — the rows reached by following arrows
* Each `~>` or `<~` one foreign-key hop

**_Variants_**:

For BackRefs, a dot (`.`) may be used on the first outer hop:

| Formal                                  | Shorthand                            |
| :-------------------------------------- | :----------------------------------- |
| `(author <~ posts) ~> title`            | `(author <~ posts).title`            |
| `(author <~ comments) ~> post ~> title` | `(author <~ comments).post ~> title` |

## DeepRefs in Context

DeepRefs expose foreign-key relationships as **first-class** column references inside SQL.<br>
They behave like columns — and work anywhere a column reference works.

* `SELECT fk ~> col FROM ...` (projection)
* `fk ~> col + 2, LOWER(fk ~> col)` (expressions)
* `SELECT/UPDATE/DELETE ... WHERE fk ~> col = 1` (filtering)
* `SELECT ... ORDER BY fk ~> col` (ordering)
* `UPDATE ... SET fk ~> col = 2` (writes)
* `INSERT INTO ... (fk ~> col) VALUES (...)` (writes) <!-- * `INSERT/UPDATE/DELETE ... RETURNING fk ~> col` (outputs) -->
* `INSERT INTO ... ON CONFLICT ... DO UPDATE SET fk ~> col = 2` (conditional writes)
* `SELECT v.fk ~> col FROM (SELECT fk) AS v` (derived queries)
* `FROM t1 LEFT JOIN LATERAL (SELECT t1.fk ~> col)` (lateral joins)

Essentially, wherever SQL expects a column, you can just as well drop a *ref* — a *DeepRef*.

---

## ` 1 |` Projections

In addition to keeping queries short, consistent, and readable at any complexity, DeepRefs especially turn the query surface — the SELECT list — into a connected view of data.

Internally, these expand into **LEFT JOIN** expressions derived from the schema.
Multi-hop chains become hierarchies of nested LEFT JOINs, preserving nullability and order at every step.

### `1.1 |` Projection Semantics

Inside a projection list, DeepRefs work exactly like columns — being **first-class column references**. Each yields values from the referenced row. And being syntactic sugar for LEFT JOINs, a *ref* may return `NULL` where no *right* rows match — as standard JOIN cardinality applies.

#### `1.1.1` DeepRefs (`~>`)

Forward *refs* model relationships that terminate on exactly one record:

```sql
SELECT p.id, p.title, p.author ~> name AS author_name
FROM posts AS p;
```

They project identically to their JOIN equivalents — producing at most one *right-hand* row per base record:

```sql
SELECT p.id, p.title, u.name AS author_name
FROM posts AS p
LEFT JOIN (SELECT id, name FROM users) AS u
    ON p.author = u.id;
```

Because these work as LEFT JOINs, a post without an author simply produces `NULL` for `author_name`.

Longer chains preserve this same cardinality:

```sql
SELECT c.id, c.text, c.post ~> author ~> email AS post_author_email
FROM comments AS c;
```

Those just follow the semantics of what they translate to — a hierarchy of LEFT JOINs:

```sql
SELECT c.id, c.text, u.email AS post_author_email
FROM comments AS c
LEFT JOIN (
  SELECT id, author FROM posts
  LEFT JOIN (SELECT id, email FROM users) AS u ON posts.author = u.id
) AS p ON c.post = p.id;
```

#### `1.1.2` BackRefs (`<~`)

Backward *refs* model relationships that may terminate on _multiple_ records — rows in other tables that reference the current one through a foreign key:

```sql
SELECT u.id, (author <~ posts) ~> title AS post_title
FROM users AS u;
```

They project just identically as their JOIN equivalent — producing one output row for each matching *right-hand* record:

```sql
SELECT u.id, p.title AS post_title
FROM users AS u
LEFT JOIN (SELECT author, title FROM posts) AS p
    ON p.author = u.id;
```

Because these are also LEFT JOINs, a user without posts simply produces `NULL` for `post_title`.

When there are multiple matching *right-hand* rows, those naturally become additional output rows.<br>
But those may also be aggregated into a single collection field:

```sql
SELECT u.id, JSON_AGG((author <~ posts) ~> title) AS post_titles
FROM users AS u
GROUP BY u.id;
```

That would equate to:

```sql
SELECT u.id, JSON_AGG(p.title) AS post_titles
FROM users AS u
LEFT JOIN (SELECT author, title FROM posts) AS p
    ON p.author = u.id
GROUP BY u.id;
```

Alternatively, you can use the [declarative aggregation syntax](/linked-ql/lang/json-Literals#-2--aggregation-syntax): `AS col[]`.<br>
This performs aggregation **within** the BackRef’s inner scope rather than the outer query, isolating the grouping semantics to that subrelation.

```sql
SELECT u.id, (author <~ posts) ~> title AS title[]
FROM users AS u;
```

Which expands to:

```sql
SELECT u.id, p.title AS title
FROM users AS u
LEFT JOIN (
    SELECT author, JSON_AGG(title) AS title
    FROM posts
    GROUP BY author
) AS p
    ON p.author = u.id;
```

This gives you aggregated results without requiring the `GROUP BY` clause on the main query.

| Form                         | Aggregation Scope   | Outer Query Grouped | Effect                                                         |
| :--------------------------- | :------------------ | :------------------ | :------------------------------------------------------------- |
| `JSON_AGG((fk <~ T) ~> col)` | outer query         | ✅ yes               | outer grouping semantics apply                                 |
| `(fk <~ T) ~> col AS col[]`  | inner BackRef scope | ❌ no                | aggregation scoped to BackRef; outer query ungrouped |

For chained backward refs, those also just follow the semantics of what they translate to — a hierarchy of LEFT JOINs, preserving both nullability and join order across depth.

### `1.2 |` Structural Projection

DeepRefs can project structures instead of scalars — returning object-shaped results from the referenced rows.

```sql
SELECT p.id, p.title, p.author ~> { id, name } AS author
FROM posts AS p;
```

That would equate to:

```sql
SELECT p.id, p.title,
    JSON_BUILD_OBJECT('id', u.id, 'name', u.name) AS author
FROM posts AS p
LEFT JOIN (SELECT id, name FROM users) AS u
    ON p.author = u.id;
```

The special wildcard form: `{ * }` projects all columns from the referenced table:

```sql
SELECT p.title, p.author ~> { * } AS author
FROM posts AS p;
```

That would equate to:

```sql
SELECT p.title,
    JSON_BUILD_OBJECT(
      'id', u.id,
      'name', u.name,
      'email', u.email
    ) AS author
FROM posts AS p
LEFT JOIN (SELECT id, name, email FROM users) AS u
    ON p.author = u.id;
```

Nested structures compose naturally across relationships:

```sql
SELECT c.id, c.text,
    c.post ~> {
      title,
      author: author ~> { name, email }
    } AS post
FROM comments AS c;
```

BackRefs can similarly project structures instead of scalars — returning object-shaped results from the referenced rows.

And as before, rows may be aggregated into a collection:

```sql
SELECT u.id,
    (author <~ posts) ~> { id, title } AS posts[]
FROM users AS u;
```

That would equate to:

```sql
SELECT u.id, p.posts AS posts
FROM users AS u
LEFT JOIN (
    SELECT author,
        JSON_AGG(JSON_BUILD_OBJECT('id', id, 'title', title)) AS posts
    FROM posts
    GROUP BY author
) AS p
    ON p.author = u.id;
```

### `1.3 |` Projection Summary

In the SELECT surface, DeepRefs can project:

* **scalars** — individual referenced fields: `fk ~> col`
* **structures** — shapes of related columns: `fk ~> { col1, col2 }`
* **collections** — aggregated collections: `AS alias[]`

Also, each follows the same join semantics:

+ **DeepRefs (`~>`)** yield one related record (and nullable)
+ **BackRefs (`<~`)** yield zero or more (and nullable, optionally aggregated)

---

## ` 2 |` Expressions

Because DeepRefs are **first-class column references**, they can participate in any expression exactly as ordinary columns do:

```sql
SELECT fk ~> col + 3        -- same as (fk ~> col) + 3
FROM t;
```

### `2.1 |` Composability

DeepRef operators — `~>` and `<~` — bind tighter than any other SQL operator (arithmetic, comparison, logical, etc.).<br>
Thus, above, the `~>` operator resolves before the `+` operator.

Essentially, DeepRefs hold together as indivisible units, just like ordinary columns. Thus,
parentheses around them aren't necessary; but those are perfectly valid and can be used to clarify intent.

Each expression is evaluated on the **dereferenced value**.

```sql
SELECT fk ~> value + 1;                    -- arithmetic
SELECT LOWER(fk ~> name);                  -- function call
SELECT COALESCE(fk ~> email, 'none');      -- null handling
SELECT fk ~> title ILIKE '%draft%';        -- predicate
SELECT fk ~> created_at > NOW() - INTERVAL '7 days'; -- comparison
```

Because they can appear anywhere a column reference can, they can be used in filtering, ordering, and conditional contexts:

```sql
SELECT * FROM posts
WHERE author ~> email ILIKE '%@example.com'
ORDER BY author ~> name;
```

### `2.2 |` Structural Contexts

DeepRefs can terminate as composite record types in contexts where record types apply:

```sql
SELECT *
FROM posts
WHERE $1 IN author ~> (username, email);
```

Since the left-hand side of the `IN` operator can be a tuple, we can also write:

```sql
SELECT *
FROM posts
WHERE author ~> (id, name) IN (1, 'Ada');
```

In each case, the tuple syntax applies to the dereferenced path, not to the path itself.

### `2.3 |` Expression Summary

DeepRefs behave as atomic references in expressions:

* **Binding:** `~>` and `<~` bind tighter than all other operators; no special parentheses required.
* **Composability:** usable in any expression or clause where a column works.
* **Structural forms:** may terminate as tuples in contexts expecting tuples.

---

## ` 3 |` Mutations

*Declaratively write through relationships*

DeepRefs aren’t limited to reading.<br>
You can **write through them** — directly into related tables, using the same syntax you use to traverse them.

```sql
INSERT INTO posts
  (title, author ~> name)
VALUES
  ('Intro to DeepRefs', 'Ada Lovelace');
```

This single statement creates both the post and its author in one operation.

Generally, the outer command defines what the statement does:

* `INSERT` — create this structure.
* `UPSERT` — create or update this structure (update where rows exist).
* `UPDATE` — update this structure (ignore where rows don’t exist).

The direction of traversal (`~>` or `<~`) determines the order of execution within the dependency graph.<br>
The compiler builds and executes that graph automatically within one statement.

### `3.1 |` DeepRefs (`~>`)

A DeepRef mutation implies a write through a foreign key — from the referencing row to the referenced one.

```sql
INSERT INTO posts
  (title, author ~> name)
VALUES
  ('Intro to DeepRefs', 'Ada Lovelace');
```

This executes **depth-first**, with **primary keys binding to foreign keys up the structure**:

```
Command:
INSERT post → author → name  (create this structure)

Execution order:
  1. CREATE user (name)
  2. CREATE post (linked to user.id)
```

That expands conceptually to:

```sql
WITH inserted_authors AS (
  INSERT INTO users (name)
  VALUES ('Ada Lovelace')
  RETURNING id
)
INSERT INTO posts (title, author)
SELECT 'Intro to DeepRefs', id FROM inserted_authors;
```

Refs spanning multiple columns take composite values:

```sql
INSERT INTO posts
  (title, author ~> (name, email))
VALUES
  ('Intro to DeepRefs', ROW('Ada Lovelace', 'ada@example.com'));
```

Semantics and execution order remain the same.

### `3.2 |` BackRefs (`<~`)

A BackRef mutation traverses in the opposite direction — from a referenced row to its dependents.

```sql
INSERT INTO users
  (name, (author <~ posts) ~> title)
VALUES
  ('Ada Lovelace', 'Intro to DeepRefs');
```

This executes depth-first, again, but reversed in direction — with parent primary keys binding to foreign keys down the structure:

```
Command:
INSERT user ← post → title  (create this structure)

Execution order:
  1. CREATE user
  2. CREATE post (title)  (linked to user.id)
```

That expands conceptually to:

```sql
WITH new_user AS (
  INSERT INTO users (name)
  VALUES ('Ada Lovelace')
  RETURNING id
)
INSERT INTO posts (title, author)
SELECT 'Intro to DeepRefs', id FROM new_user;
```

Refs spanning multiple columns take composite values as before:

```sql
INSERT INTO users
  (name, (author <~ posts) ~> (id, title))
VALUES
  ('Ada Lovelace', ROW(12, 'Intro to DeepRefs'));
```

### `3.3 |` Nested and Mixed Chains

As in the case of reads, refs can be multi-hop:

```sql
INSERT INTO comments
  (text, post ~> author ~> name)
VALUES
  ('Brilliant work!', 'Ada Lovelace');
```

For refs that alternate direction across levels to model defined relationships,
each change of arrow (`~>` or `<~`) introduces a new dependency edge, and each path is resolved depth-first.

```sql
INSERT INTO posts
  (title, (post <~ comments) ~> author ~> (name, email))
VALUES
  ('Nice post!', ROW('Ada Lovelace', 'ada@example.com'));
```

Here, each direction change reverses the dependency orientation while preserving referential closure:

```
Command:
INSERT post → comment → author  (create this structure)

Execution order:
  1. CREATE post (title)
  2. CREATE user (name, email)
  3. CREATE comment (linked to post.id, user.id)
```

### `3.4 |` Default and Derived Sources

Default and derived sources integrate seamlessly with DeepRefs.<br>
Both preserve dependency ordering and transactional behavior.

PostgreSQL has the `INSERT ... DEFAULT VALUES` syntax:

```sql
INSERT INTO posts
  (title, author ~> (name, email))
DEFAULT VALUES;
```

That expands conceptually to:

```sql
WITH inserted_authors AS (
  INSERT INTO users (name, email)
  DEFAULT VALUES
  RETURNING id
)
INSERT INTO posts (title, author)
SELECT DEFAULT, id FROM inserted_authors;
```

Both PostgreSQL and MySQL have the `INSERT ... SELECT` syntax:

```sql
INSERT INTO posts
  (id, title, author ~> (name, email))
SELECT id, title, ROW(customer_name, customer_email)
FROM orders;
```

That expands conceptually to:

```sql
WITH source_orders AS (
  SELECT id, title, customer_name, customer_email FROM orders
),
inserted_authors AS (
  INSERT INTO users (name, email)
  SELECT customer_name, customer_email FROM source_orders
  RETURNING id
)
INSERT INTO posts (id, title, author)
SELECT o.id, o.title, a.id
FROM source_orders AS o
JOIN inserted_authors AS a ON deterministic row alignment;
```

Each row from the source query becomes one complete relational structure and executes deterministically within the same transaction.

### `3.5 |` Upserts

DeepRefs are fully supported in [UPSERT](/linked-ql/lang/upsert) operations — being just a variation of the `INSERT` statement.

```sql
UPSERT INTO posts
  (title, author ~> name)
VALUES
  ('Intro to DeepRefs', 'Ada Lovelace');
```

This executes depth-first, with dependency order preserved as in inserts:

```
Command:
UPSERT post → author → name  (materialize this structure — create or update)

Execution order:
  1. UPSERT user (name)
  2. UPSERT post (linked to user.id)
```

That expands conceptually to a dialect-aware upsert:

```sql
WITH resolved_authors AS (
  INSERT INTO users (name)
  VALUES ('Ada Lovelace')
  ON CONFLICT (name)
  DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO posts (title, author)
SELECT 'Intro to DeepRefs', id FROM resolved_authors
ON CONFLICT (title)
DO UPDATE SET author = EXCLUDED.author;
```

#### `3.5.1` Explicit Conditionals (Conflict-Handling)

For the explicit `INSERT ... ON CONFLICT` form of upserts, refs remain traversable inside conflict-handling clauses.<br>
The specified path is traversed only when the conflict condition is triggered.

```sql
INSERT INTO posts (title)
VALUES ('Intro to DeepRefs')
ON CONFLICT (title)
DO UPDATE SET author ~> name = 'Ada Lovelace';
```

Here, if a post with the same title already exists, the `ON CONFLICT` clause updates the author’s name through the `author` reference, rather than overwriting the foreign key.

```
Command:
CONDITIONALLY UPDATE post → author → name  (update existing structure through refs)

Execution order:
  1. UPDATE post (title)
  2. UPDATE user (name)
```

### `3.6 |` Updates

Updates execute **left-to-right**, regardless of traversal direction.<br>
These also execute in a single transaction and maintain referential coherence across the chain.

```sql
UPDATE posts AS p
SET author ~> (name, email) = ROW('Ada Lovelace', 'ada@example.com')
WHERE p.title = 'Intro to DeepRefs';
```

This resolves sequentially, so deeper mutations apply to the results of prior paths within the same statement:

```
Command:
UPDATE post → author → (name, email)  (update this structure)

Evaluation order:
  1. UPDATE post ()
  2. UPDATE user (name, email)
```

That expands conceptually to:

```sql
WITH updated_posts AS (
  UPDATE posts p
  SET ...
  RETURNING p.author
)
UPDATE users
SET name = 'Ada Lovelace', email = 'ada@example.com'
WHERE id IN (SELECT author FROM updated_posts);
```

### `3.7 |` Deletes

For deletes, refs have their place in the `WHERE` clause.<br>
Each ref simply expands to a relational join that filters the target rows before deletion.

```sql
DELETE FROM users
WHERE (author <~ posts) ~> title = 'Intro to DeepRefs';
```

```
Command:
DELETE user (remove rows matching this relationship)
```

### `3.8 |` Mutation Summary

* **Resolution (`~>`, `<~`)** — dependencies resolve first, with primary keys binding up the structure.
* **Atomicity** — every structural mutation, regardless of complexity, compiles into **one SQL statement**.
* **Consistency** — referential integrity is always schema-driven.
* **Determinism** — the same mutation yields the same dependency plan.

---

## ` 4 |` Foreign Key Scopes

Foreign keys in LinkedQL's relational space retain their semantics across query scopes.<br>
This means, foreign keys projected from an inner query or inherited from an outer query can be traversed seamlessly as *refs* across the query boundary.

#### `4.1 |` Foreign Key Projected from an Inner Query

A foreign key projected from a derived query remains traversable in the outer scope:

```sql
SELECT dt.post_fk ~> title AS post_title, dt.author_fk ~> email AS author_email
FROM (
    SELECT c.post AS post_fk, c.post ~> author AS author_fk
    FROM comments AS c
) AS dt;
```

Here, the inner query projects `post_fk` and `author_fk` as output columns.<br>
Each crosses the query boundary as a foreign key and naturally supports traversal.

#### `4.2 |` Foreign Key Inherited from an Outer Query

A foreign key from an outer query can be referenced within an inner scope,
allowing DeepRefs to resolve normally inside the subquery.

```sql
SELECT p.title, (
    SELECT name
    FROM users AS u
    WHERE u.email = p.author ~> email
) AS author_name
FROM posts AS p;
```

Here, the inner subquery inherits `p.author` from each row in the outer query.<br>
That crosses the query boundary as a foreign key and naturally supports traversal.

The same semantics apply within **LATERAL** joins,
where the derived table depends on the current row of an outer *FROM* item:

```sql
SELECT p.title, sub.name AS author_name, sub.email AS author_email
FROM posts AS p
LEFT JOIN LATERAL (
    SELECT name, email
    FROM users AS u
    WHERE u.email = p.author ~> email
    LIMIT 1
) AS sub ON TRUE;
```

The LATERAL clause inherits `p` row by row, and traversal works naturally as before.

### `4.3 |` Scope Summary

Essentially, any foreign key in scope — whether inherited or projected — retains its relational meaning and can be traversed as a DeepRef.

---

## Appendix A — Implied Schema and Dialect

The examples in this document assume a simple illustrative schema and a specific SQL dialect.

### Default Dialect

Unless otherwise noted, all examples assume the **PostgreSQL** syntax and semantics.<br>
Equivalent behavior applies across other SQL dialects (e.g., MySQL, MariaDB) **where supported**.

### Reference Schema

The following minimal schema underpins most examples:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title TEXT,
  author INTEGER REFERENCES users (id)
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  text TEXT,
  post INTEGER REFERENCES posts (id)
);
```
