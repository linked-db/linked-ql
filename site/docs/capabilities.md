# Capabilities

LinkedQL was built with intent — to bring coherence, expressiveness, and automation to the heart of the database. Its capabilities aren’t add-ons; they’re the natural evolution of what SQL should have been all along.

## Language Capabilities

LinkedQL lets you speak an advanced form of SQL right on your database.
With syntax shorthands and first-class support for relationships and JSON, you skip the imperative parts of SQL and get to writing more **intentful** SQL.
LinkedQL automatically compiles your query down to the SQL your database understands.

| **Feature**       | **Summary**                                                                     | **Docs**                                                                          |
| :---------------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------- |
| **DeepRefs**      | Follow relationships using simple arrow notation (`a ~> b ~> c`).               | [Read → DeepRefs Docs](/docs/capabilities/deeprefs)      |
| **JSON Literals** | Model JSON shapes directly in SQL using JSON literals (`{}`, `[]`).             | [Read → JSON Docs](/docs/capabilities/json-literals)     |
| **UPSERTS**       | Perform insert-or-update operations with a literal `UPSERT` statement.          | [Read → UPSERTS Docs](/docs/capabilities/upsert)        |

### Examples

---

<details open name="lang-capab"><summary><b>(a)</b> JSON Literals — Structured Projection</summary>

> SQL constructs return shaped JSON directly — no post-mapping layer needed.

```js
const result = await client.query(
  `SELECT { id, name, email } AS user
  FROM users
  WHERE id = 1;`
);

console.log(result.rows[0]);
// → { user: { id: 1, name: 'Jane', email: 'jane@example.com' } }
```

</details>

---

<details name="lang-capab"><summary><b>(b)</b> DeepRefs — Inline Relationship Traversal</summary>

> Follow foreign keys directly inside a query — joins expressed as natural relationships.

```js
const posts = await client.query(
  `SELECT title, author ~> { name, email }
  FROM posts
  WHERE published = true;`
);

console.log(posts.rows[0]);
// → { title: 'Syntax Shorthands', author: { name: 'John Doe', email: 'john@example.com' } }
```

</details>

---

<details name="lang-capab"><summary><b>(c)</b> UPSERT — Insert-or-Update in One Step</summary>

> LinkedQL exposes UPSERT as a literal statement — cleaner and portable across dialects.

```js
await client.query(
  `UPSERT INTO users (id, name, email)
  VALUES
    (1, 'Jane', 'jane@example.com'),
    (2, 'James', 'j2@example.com')`
);
```

</details>

## Runtime Capabilities

LinkedQL enables **SQL-level reactivity** and **automatic schema versioning** right on your database — **no plugins, database extensions, or middleware** required.
(A built-in **Realtime Engine** and **Timeline Engine** quietly extend your database at execution time.)
Modern apps and modern workflows — solved.

| **Feature**         | **Summary**                                                                                         | **Docs**                                                                           |
| :------------------ | :-------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **Realtime SQL**    | Run live, self-updating queries right on your database.                                             | [Read → RealtimeSQL Docs](/docs/capabilities/realtime-sql) |
| **Timeline Engine** | Get automatic database versioning on every DDL operation; bind queries to specific schema versions. | *(Coming soon)*                                                                    |

### Examples

---

<details open name="runtime-capab"><summary><b>(a)</b> Live Queries — Continuous Results</summary>

> Turn on reactivity for any query with `{ live: true }` — get a live view of your data.

```js
const result = await client.query(
  `SELECT p.title, p.category, p.views, u.name
  FROM posts AS p LEFT JOIN users AS u ON p.author = u.id
  WHERE p.published = true ORDER BY p.created_at DESC`,
  { live: true }
);

setInterval(() => console.log(result.rows), 1000);
// → Automatically updates as post or author data changes
```

</details>

---

<details name="runtime-capab"><summary><b>(b)</b> Live Queries + Language Shorthands</summary>

> Combine runtime reactivity with language-level extensions — relational traversal, JSON shapes, and more.

```js
const result = await client.query(
  `SELECT
    { title, category, views } AS post,
    author ~> { name, email } AS author
  FROM posts WHERE published = true ORDER BY created_at DESC`,
  { live: true }
);

setInterval(() => console.log(result.rows), 1000);
// → Automatically updates as post or author data changes
```

</details>

---

<details name="runtime-capab"><summary><b>(c)</b> Version Binding — Point-in-Time Queries</summary>

> Anchor a query to a specific schema version — guard against breaking changes with semantic version control.

```js
const result = await client.query(
  `SELECT name, email
  FROM users@2_3
  WHERE active = true;`
);

console.log(result.rows);
// → Runs against schema version 2.3 — unaffected by later migrations
```

</details>

## Offline Capabilities

LinkedQL can run anywhere your app runs.
Its built-in **FlashQL** runtime brings all of LinkedQL to the **client**, the **edge**, and **offline** environments — same SQL, same semantics.
It extends that with built-in support for **federation**, **materialization**, and **sync** between remote databases and local state.

| **Capability**      | **Summary**                                                  | **Docs**                                                                   |
| :------------------ | :----------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Federation**      | Query across remote and local databases as a single surface. | [Read → FlashQL Docs](/docs/flashql) |
| **Materialization** | Materialize remote datasets locally for offline queries.     | [Read → FlashQL Docs](/docs/flashql) |
| **Sync**            | Two-way synchronization between local and remote databases.  | [Read → FlashQL Docs](/docs/flashql) |

### Examples

---

<details open name="offline-capab"><summary><b>(a)</b> Local Database — Runs Anywhere</summary>

> The same SQL engine that runs on the server — fully on the client.

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
const client = new FlashClient();

await client.query(`CREATE TABLE users (id SERIAL, name TEXT)`);
await client.query(`INSERT INTO users (name) VALUES ('Alice'), ('Bob')`);

const result = await client.query(`SELECT JSON_AGG(name) AS users FROM users`);

console.log(result.rows);
// → [{ users: ['Alice', 'Bob'] }]
```

</details>

---

<details name="offline-capab"><summary><b>(b)</b> Federation — Local + Remote in One Query</summary>

> Query remote and local tables together — one SQL surface, automatic remote joins.

```js
await client.federate({ store: ['orders'] }, remoteConfig);

const result = await client.query(
  `SELECT
    u.name,
    COUNT(o.id) AS total_orders
  FROM users AS u LEFT JOIN store.orders AS o ON o.user_id = u.id
  GROUP BY u.id
  ORDER BY total_orders DESC`
);

console.log(result.rows);
// → combines local `users` and remote `orders` data transparently
```

</details>

---

<details name="offline-capab"><summary><b>(c)</b> Sync — Continuous Offline Resilience</summary>

> Keep local and remote data automatically aligned — bidirectional, incremental, and resumable.

```js
await client.sync({ store: ['orders'] }, remoteConfig);

const result = await client.query(
  `SELECT
    u.name,
    COUNT(o.id) AS total_orders
  FROM users AS u LEFT JOIN store.orders AS o ON o.user_id = u.id
  GROUP BY u.id ORDER BY total_orders DESC`
);

client.on('sync:status', s => console.log('Sync status:', s.state));
client.on('sync:change', e => console.log('Δ', e.table, e.type));
// → local tables stay mirrored with remote updates — even after reconnects
```

</details>
