# Language Surface

LinkedQL extends SQL across three core areas: how data is shaped and related, how state is mutated, and how execution correctness is enforced.

---

## Object Syntax

LinkedQL extends SQL with an "object" paradigm that maps to the conventional application-level object thinking.

### Meet JSON Literals

**JSON Literals** let you define the exact shape your application expects directly in SQL.

```js
const result = await db.query(`
  SELECT
    id,
    { first: first_name, last: last_name } AS name,
    { email, phone: phone_number } AS contact
  FROM users
`);
```

No remapping step or post-processing code. The query itself defines the shape.

### Meet DeepRefs

**DeepRefs** let you follow relationships directly in SQL using simple arrow notations.

```js
const posts = await db.query(`
  SELECT
    title,
    author ~> {
      id,
      name,
      profile ~> { avatar_url }
    } AS author
  FROM posts
  WHERE published = true
`);
```

No need for an ORM or manual JOIN logic.

If you've defined foreign key relationships in your tables, you can traverse them directly.

The above expresses the data the way the application already understands it: *a post has an author, an author has a profile*

### The Broader Idea

Database logic is rarely just about returning rows. It is about aligning SQL semantics with application-level intent.

* navigating relationships
* shaping results into application-ready structures
* coordinating read and write intent

This logic often spills out of SQL into post-processing layers, with much glue code. LinkedQL pulls this logic back into the query itself.

---

### Documentation

| Capability        | What It Adds                         | Docs                                 |
| :---------------- | :----------------------------------- | :----------------------------------- |
| **DeepRefs**      | Direct relationship traversal in SQL | [DeepRefs](/lang/deeprefs)           |
| **JSON Literals** | Direct structuring in SQL            | [JSON Literals](/lang/json-literals) |

---

## Declarative DML

LinkedQL replaces procedural mutation patterns in SQL with declarative expressions. Instead of expressing how to modify data, you express the intended final state.

### Meet UPSERT

**UPSERT** expresses insert-or-update as a single declarative mutation, removing the need for existence checks or branching logic.

```js
await db.query(`
  UPSERT INTO users (id, name, email)
  VALUES (1, 'Ada Lovelace', 'ada@math.org')
`);
```

If the record exists, it is updated. If not, it is created.

No conditional pre-checks or duplicated mutation logic across layers. One statement expresses the full intent.

### The Broader Idea

Mutation logic is rarely about individual rows — it is about reaching a consistent state.

Traditional DML forces applications into procedural patterns:

* explicit existence checks
* branching control flow
* duplicated insert/update paths

Single-statement operations collapse this flow into a single declarative step.

### Documentation

| Capability | What It Adds                    | Docs                   |
| :--------- | :------------------------------ | :--------------------- |
| **UPSERT** | Unified insert-or-update intent | [UPSERT](/lang/upsert) |

---

## Type Safety

LinkedQL allows queries to declare constraints that are often implicit but required for correctness.

### Meet Version Binding

**Version Binding** allows queries to explicitly declare the schema version they depend on, enabling safe evolution of applications and databases in parallel.

```js
const users = await db.query(`
  SELECT id, name, email
  FROM users@2_1
`);
```

If the database does not satisfy the declared version, the query fails early instead of executing under incompatible assumptions.

Contract mismatches are surfaced at the query boundary, not discovered indirectly through runtime behavior. These constraints can also be validated statically before execution.

### The Broader Idea

Schema evolution is rarely isolated. It introduces:

* breaking changes across services
* migration coordination overhead
* fragile backward compatibility layers

Version Binding makes evolution explicit at the query level, allowing applications to pin behavior deterministically and migrate gradually without hidden coupling.

> Version binding is currently only supported in FlashQL

### Documentation

| Capability          | What It Adds                  | Docs                                     |
| :------------------ | :---------------------------- | :--------------------------------------- |
| **Version Binding** | Query-level version targeting | [Version Binding](/lang/version-binding) |

---

## SQL Reference

LinkedQL builds on standard SQL, extending some areas while leaving others unchanged or not yet supported.

A full reference of supported and unsupported SQL features is planned and will document:

+ supported SQL syntax and behavior
+ unsupported or partially supported features