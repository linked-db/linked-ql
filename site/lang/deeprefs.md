# DeepRefs

_Follow relationships using simple arrow notation: `a ~> b`._

```sql
SELECT author ~> name FROM posts;
```

_Mutate relationships through the same path._

```sql
UPDATE posts SET author ~> name = 'Ada Lovelace';
```

---

## The Idea

SQL schemas already describe relationships — 
`FOREIGN KEY (author) REFERENCES users (id)`

DeepRefs let you **traverse those foreign-key declarations directly**, inline, without writing a join.

If you’ve declared any relationship, you can traverse it directly.
LinkedQL resolves the path from the schema catalog.

DeepRefs are one of LinkedQL's central language features.

---

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

---

## Grammar

DeepRefs are **first-class column references**. They can participate in any expression exactly as ordinary columns do:

```sql
SELECT fk ~> col + 3        -- same as (fk ~> col) + 3
FROM t;
```

Those operators — `~>` and `<~` — bind tighter than standard SQL expression operators (arithmetic, comparison, logical, etc.).<br>
Thus, above, the `~>` operator resolves before the `+` operator.

Essentially, DeepRefs hold together as indivisible units, just like ordinary columns. **Thus, parentheses around them aren't necessary.**

```sql
SELECT fk ~> value + 1;                    -- arithmetic
SELECT LOWER(fk ~> name);                  -- function call
SELECT COALESCE(fk ~> email, 'none');      -- null handling
SELECT fk ~> title ILIKE '%draft%';        -- predicate
SELECT fk ~> created_at > NOW() - INTERVAL '7 days'; -- comparison
```

Because they can appear anywhere a column reference do, they can be used in filtering, ordering, and various other contexts:

* `SELECT fk ~> col FROM ...` (projection)
* `fk ~> col + 2, LOWER(fk ~> col)` (expressions)
* `SELECT/UPDATE/DELETE ... WHERE fk ~> col = 1` (filtering)
* `SELECT ... ORDER BY fk ~> col` (ordering)
* `UPDATE ... SET fk ~> col = 2` (writes)
* `INSERT INTO ... (fk ~> col) VALUES (...)` (writes)
* `INSERT INTO ... ON CONFLICT ... DO UPDATE SET fk ~> col = 2` (conditional writes)
* `SELECT v.fk ~> col FROM (SELECT fk) AS v` (derived queries)
* `FROM t1 LEFT JOIN LATERAL (SELECT t1.fk ~> col)` (lateral joins)

Another general rule is that DeepRefs are both *navigation operators* (traversing structure) and *composition operators* (building new structures).

This is the biggest part of the rest of the document.

### Nesting

DeepRefs compose naturally across multiple relationship hops.

Each hop is evaluated in the context of the previous result, preserving relational cardinality at each step:

```sql
SELECT
  content,
  author ~> name AS commenter,
  post ~> author ~> name AS publisher
FROM comments;
```

As a result:

+ chaining DeepRefs is equivalent to walking a path through the schema graph
+ DeepRefs can be nested to the level that the underlying relationships permit

Chains are associative:

> `post ~> author ~> name` is equivalent to `(post ~> author) ~> name`

Chains can alternate direction to express more complex traversals:

```sql
SELECT
  (author <~ posts) ~> author ~> email
FROM users;
```

This reads as:

> "From the current user, find all referencing posts, then for each post, follow its author again."

Each change in direction introduces a new dependency edge, but composition remains consistent.

### Object Syntax

DeepRefs can project objects instead of scalars.

Instead of selecting individual columns, you can describe the shape of the related data directly:

```sql
SELECT
  title,
  author ~> { username, email },
  author ~> [ phone, mobile ] AS author_contacts
FROM posts;
```

Object projections compose naturally across relationships:

```sql
SELECT
  title,
  author ~> {
    username,
    contact: { email, phone }
  } AS author
FROM posts;
```

And across DeepRef chains:

```sql
SELECT
  post ~> {
    title,
    author: author ~> { name, email }
  } AS post
FROM comments;
```

Because object syntax works inside DeepRefs, you can combine:

+ traversal (`~>`, `<~`)
+ shaping (`{}`, `[]`)
+ aggregation (`AS field[]`)

into a single expression:

```sql
SELECT
  u.id,
  (author <~ posts) ~> {
    title,
    author: author ~> { name }
  } AS posts[]
FROM users AS u;
```

This expresses:

> "For each user, return their posts as structured objects, including nested author data."

### Tuple Syntax

DeepRefs can terminate as composite lists in contexts where composite lists apply:

```sql
SELECT *
FROM posts
WHERE $1 IN author ~> (username, email);
```

Since the left-hand side of the `IN` operator can be a composite list, we can also write:

```sql
SELECT *
FROM posts
WHERE author ~> (id, name) IN (1, 'Ada');
```

### BackRef: Alternative Dot Syntax

BackRefs support a dot (`.`) syntax on the first outer hop:

| Formal                                  | Shorthand                            |
| :-------------------------------------- | :----------------------------------- |
| `(author <~ posts) ~> title`            | `(author <~ posts).title`            |
| `(author <~ comments) ~> post ~> title` | `(author <~ comments).post ~> title` |

Dot syntax only applies after the base BackRef resolution.

### BackRef: Optional Left Binding

When using BackRefs in queries involving multiple instances of the same table (such as self-joins), its left-hand binding may be ambiguous.

For example, in the self-join: `... FROM users AS u1 LEFT JOIN users AS u2 ...`, the left-hand binding of the BackRef `(author <~ posts) ~> title` would be ambiguous — potentially matching both `u1` and `u2`.

In these cases, you must explicitly specify the binding alias in the BackRef syntax to disambiguate: `((u1) author <~ posts) ~> title`.

```sql
SELECT u1.id, ((u1) author <~ posts) ~> title
FROM users AS u1 LEFT JOIN users AS u2 ON u1.id = u2.id
```

Here, `((u1) author <~ posts)` makes it clear that the BackRef binding to `u1` on the left-side for the foreign key traversal.

This explicit aliasing ensures that DeepRefs and BackRefs resolve correctly in complex queries with multiple table instances.

---

## Projections

In SELECT statements, DeepRefs expand into relational joins derived from the schema.

Multi-hop chains become hierarchies of nested LEFT JOINs, preserving nullability and order at every step.

### Projection Semantics

Inside a SELECT list, DeepRefs work exactly like columns — being **first-class column references**. Each yields values from the referenced row.

Also, given their relational join semantics, a *ref* may return `NULL` where no *right* rows match — as standard JOIN cardinality applies.

#### DeepRefs (`~>`)

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

Those just follow the semantics of what they translate to — a hierarchy of joins:

```sql
SELECT c.id, c.text, u.email AS post_author_email
FROM comments AS c
LEFT JOIN (
  SELECT id, author FROM posts
  LEFT JOIN (SELECT id, email FROM users) AS u ON posts.author = u.id
) AS p ON c.post = p.id;
```

#### BackRefs (`<~`)

Backward *refs* model relationships that may terminate on _multiple_ records — rows in other tables that reference the current one through a foreign key:

```sql
SELECT u.id, (author <~ posts) ~> title AS post_title
FROM users AS u;
```

They project just identically as their join equivalent — producing one output row for each matching *right-hand* record:

```sql
SELECT u.id, p.title AS post_title
FROM users AS u
LEFT JOIN (SELECT author, title FROM posts) AS p
    ON p.author = u.id;
```

Because these are also joins, a user without posts simply produces `NULL` for `post_title`.

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

Alternatively, you can use the [declarative aggregation syntax](/lang/json-literals#aggregation-syntax): `AS col[]`.<br>
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

For chained backward refs, those also just follow the semantics of what they translate to — a hierarchy of joins, preserving both nullability and join order across depth.

### Structural Projection

DeepRefs that project structure return object-shaped results from the referenced rows.

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

### Projection Summary

In the SELECT surface, DeepRefs can project:

* **scalars** — individual referenced fields: `fk ~> col`
* **structures** — shapes of related columns: `fk ~> { col1, col2 }`
* **collections** — aggregated collections: `AS alias[]`

---

## Mutations

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

### DeepRefs (`~>`)

A DeepRef mutation implies a write through a foreign key — from the referencing row to the referenced one.

```sql
INSERT INTO posts
  (title, author ~> name)
VALUES
  ('Intro to DeepRefs', 'Ada Lovelace');
```

This executes **depth-first**, with **primary keys binding to foreign keys up the structure**:

```
Command: create this structure:

  INSERT post → author → name

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

### BackRefs (`<~`)

A BackRef mutation traverses in the opposite direction — from a referenced row to its dependents.

```sql
INSERT INTO users
  (name, (author <~ posts) ~> title)
VALUES
  ('Ada Lovelace', 'Intro to DeepRefs');
```

This executes depth-first, again, but reversed in direction — with parent primary keys binding to foreign keys down the structure:

```
Command: create this structure:
  
  INSERT user ← post → title

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

### Nested and Mixed Chains

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
Command: create this structure:

  INSERT post → comment → author

Execution order:
  1. CREATE post (title)
  2. CREATE user (name, email)
  3. CREATE comment (linked to post.id, user.id)
```

### Default and Derived Sources

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

### Upserts

DeepRefs are fully supported in [UPSERT](upsert) operations — being just a variation of the `INSERT` statement.

```sql
UPSERT INTO posts
  (title, author ~> name)
VALUES
  ('Intro to DeepRefs', 'Ada Lovelace');
```

This executes depth-first, with dependency order preserved as in inserts:

```
Command: materialize this structure — create or update:

  UPSERT post → author → name

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

#### Explicit Conditionals (Conflict-Handling)

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
Command: update existing structure through refs:

  CONDITIONALLY UPDATE post → author → name

Execution order:
  1. UPDATE post (title)
  2. UPDATE user (name)
```

### Updates

Updates execute **left-to-right**, regardless of traversal direction.<br>
These also execute in a single transaction and maintain referential coherence across the chain.

```sql
UPDATE posts AS p
SET author ~> (name, email) = ROW('Ada Lovelace', 'ada@example.com')
WHERE p.title = 'Intro to DeepRefs';
```

This resolves sequentially, so deeper mutations apply to the results of prior paths within the same statement:

```
Command: update this structure:

  UPDATE post → author → (name, email)

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

### Deletes

For deletes, refs have their place in the `WHERE` clause.<br>
Each ref simply expands to a relational join that filters the target rows before deletion.

```sql
DELETE FROM users
WHERE (author <~ posts) ~> title = 'Intro to DeepRefs';
```

```
Command: remove rows matching this relationship:

  DELETE user
```

### Mutation Summary

Compared to a regular write:

```sql
INSERT INTO public.users (id, email)
VALUES (1, 'ada@example.com')
```

Deep writes let you mutate or create related records using paths:

```sql
INSERT INTO public.users
  (email, parent_user1 ~> (id, email))
VALUES
  ('ada@example.com', ROW (50, 'parent@example.com'))
```

---

## Foreign Key Scopes

Foreign keys in LinkedQL's relational space retain their semantics across query scopes.<br>
This means, foreign keys projected from an inner query or inherited from an outer query can be traversed seamlessly as *refs* across the query boundary.

#### Foreign Key Projected From an Inner Query

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

#### Foreign Key Inherited From an Outer Query

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

### Scope Summary

Essentially, any foreign key in scope — whether inherited or projected — retains its relational meaning and can be traversed as a DeepRef.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the related object syntax | [JSON Literals](/lang/json-literals) |
| the broader LinkedQL language surface | [Language Surface](/lang) |

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
