# Language Additions

LinkedQL extends SQL to express structure and relationships directly in the query.

Instead of flattening data and reconstructing it in application code, you define the final structure directly in the query.

## Meet JSON Literals (Inline Structuring)

```js
const result = await db.query(`
  SELECT
    id,
    { first: first_name, last: last_name } AS name,
    { email, phone: phone_number } AS contact
  FROM users
`);
```

No mapping layer. No post-processing.

* the query returns exactly the shape your UI needs
* no `map()` / `reduce()` / DTO transformation step
* fewer mismatches between backend and frontend models

---

## Meet DeepRefs (Inline Relationships)

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

The above expresses the data the way the application already understands it:

* a post has an author
* an author has a profile

---

## The Broader Idea

Database logic is rarely just about returning rows. It is often more about aligning SQL semantics with application-level behavior and intents:

+ navigating relationships  
+ shaping results into application-ready structures  
+ coordinating read and write intent  

This logic often spills out of SQL into ORMs, post-processing layers, and defensive glue code.

LinkedQL pulls that logic back into the query itself through a small set of SQL syntax extensions.

---

## Documentation

| Capability        | What It Adds                         | Docs                                         |
| :---------------- | :----------------------------------- | :------------------------------------------- |
| **DeepRefs**      | Direct relationship traversal in SQL | [DeepRefs](/lang/deeprefs)           |
| **JSON Literals** | Direct structuring in SQL            | [JSON Literals](/lang/json-literals) |
| **UPSERT**        | A direct UPSERT statement in SQL     | [UPSERT](/lang/upsert)               |
| **Version Binding** | Query-level version-binding syntax     | [Version Binding](/lang/version-binding)               |
