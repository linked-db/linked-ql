# Capabilities

The capability side of LinkedQL is where its identity shifts from a classic query client to **SQL for modern applications**.



<!--
LinkedQL introduces useful additions to SQL and the database itself that directly suport how modern applications are built — removing scaffolding layers between code and data.

The result is: ... -> as first-class language primitives.
LinkedQL takes the same syntax, relational model, and execution model
as SQL and adapts it to modern application paradigms, letting you build these applications
without scaffolding between code and data..

An application-ready SQL makes it possible to **move from the tooling layer to the language, and from code to query.**
**application-ready** form of SQL
You get SQL that’s expressive, optimized for readability, and aligned with how data actually relates and moves.
-->

## Language Capabilities

LinkedQL extends the SQL language to bring in useful syntax shorthands for relationships, JSON, and other SQL constructs.

| **Feature**       | **Summary**                                                            | **Docs**                                             |
| :---------------- | :--------------------------------------------------------------------- | :--------------------------------------------------- |
| **DeepRefs**      | Follow foreign key relationships directly in simple arrow notation.    | [Read → DeepRefs Docs](/docs/capabilities/deeprefs)  |
| **JSON Literals** | Model JSON objects and arrays using literal JSON syntax.                         | [Read → JSON Docs](/docs/capabilities/json-literals) |
| **UPSERT**        | Perform the classic `INSERT...ON CONFLICT` statement in a single step. | [Read → UPSERT Docs](/docs/capabilities/upsert)      |

### Examples

---

<details open name="lang-capab"><summary><b>(a)</b> JSON Literals — Structured Projection</summary>

> Model JSON objects and arrays using literal JSON syntax.

```js
const result = await client.query(`
  SELECT
  id,
  { first: first_name, last: last_name } AS name,
  { email, phone: phone_number } AS contact
  FROM users
`);

console.log(result.rows[0]);
// { id: 1, name: { first: 'Jane', last: 'Dark' }, contact: { email: 'jane@example.com', phone: null } }
```

</details>

---

<details name="lang-capab"><summary><b>(b)</b> DeepRefs — Relationship Traversal</summary>

> Follow foreign key relationships directly in simple arrow notation.

```js
const posts = await client.query(`
  SELECT title, author ~> { name, email }
  FROM posts
  WHERE published = true;
`);

console.log(posts.rows[0]);
// { title: 'Syntax Shorthands', author: { name: 'John', email: 'john@example.com' } }
```

</details>

---

<details name="lang-capab"><summary><b>(c)</b> UPSERT — Insert or Update</summary>

> Perform the classic `INSERT...ON CONFLICT` statement in a single step.

```js
await client.query(`
  UPSERT INTO users (id, name, email)
  VALUES
    (1, 'Jane', 'jane@example.com'),
    (2, 'James', 'j2@example.com');
`);
```

</details>

## Runtime Capabilities

LinkedQL extends the query execution layer with reactivity and automatic schema versioning as first-class database features.

| **Feature**         | **Summary**                                                            | **Docs**                                                   |
| :------------------ | :--------------------------------------------------------------------- | :--------------------------------------------------------- |
| **Live Queries**    | Turn on reactivity over any query and get back a live view of your data. | [Read → RealtimeSQL Docs](/docs/capabilities/realtime-sql) |
| **Timeline Engine** | Anchor a query to a fixed schema version for stable results over time. | *(Coming soon)*                                            |

### Examples

---

<details open name="runtime-capab"><summary><b>(a)</b> Live Queries and Live Views</summary>

> Turn on reactivity over any query and get back a live view of your data.

```js
const result = await client.query(`
  SELECT p.title, u.name
  FROM posts AS p LEFT JOIN users AS u ON p.author = u.id
  WHERE p.published = true
  ORDER BY p.created_at DESC
`, { live: true });

setInterval(() => console.log(result.rows), 1000);
// Updates automatically as post or author data changes
```

</details>

---

<details name="runtime-capab"><summary><b>(b)</b> Live Queries + DeepRefs</summary>

> Combine live results with relational traversal and JSON shaping.

```js
const result = await client.query(`
  SELECT
    { title, category } AS post,
    author ~> { name, email } AS author
  FROM posts WHERE published = true
`, { live: true });
```

</details>

---

<details name="runtime-capab"><summary><b>(c)</b> Version Binding — Point-in-Time Queries</summary>

> Anchor a query to a fixed schema version for stable results over time.

```js
const result = await client.query(`
  SELECT name, email
  FROM users@2_3
  WHERE active = true;
`);
```

</details>

## Offline Capabilities

LinkedQL bundles an embeddable SQL engine, **FlashQL**, that brings its full capabilities to the local runtime, the edge, and offline world.

| **Capability**     | **Summary**                                                   | **Docs**                             |
| :----------------- | :------------------------------------------------------------ | :----------------------------------- |
| **Local Database** | Run a full SQL engine in memory — same semantics, zero setup. | [Read → FlashQL Docs](/docs/flashql) |
| **Federation**     | Query local and remote data together in a single SQL surface. | [Read → FlashQL Docs](/docs/flashql) |
| **Sync**           | Keep local and remote tables automatically synchronized.      | [Read → FlashQL Docs](/docs/flashql) |

### Examples

---

<details open name="offline-capab"><summary><b>(a)</b> Local Database — Runs Anywhere</summary>

> Run a full SQL engine in memory — same semantics, zero setup.

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
const client = new FlashClient();

await client.query(`CREATE TABLE users (id SERIAL, name TEXT)`);
await client.query(`INSERT INTO users (name) VALUES ('Alice'), ('Bob')`);

const result = await client.query(`SELECT JSON_AGG(name) AS users FROM users`);
console.log(result.rows);
// [{ users: ['Alice', 'Bob'] }]
```

</details>

---

<details name="offline-capab"><summary><b>(b)</b> Federation — Local + Remote</summary>

> Query local and remote data together in a single SQL surface.

```js
await client.federate({ store: ['orders'] }, remoteConfig);

const result = await client.query(`
  SELECT u.name, COUNT(o.id) AS total_orders
  FROM users AS u LEFT JOIN store.orders AS o ON o.user_id = u.id
  GROUP BY u.id ORDER BY total_orders DESC;
`);
```

</details>

---

<details name="offline-capab"><summary><b>(c)</b> Sync — Continuous Alignment</summary>

> Keep local and remote tables automatically synchronized.

```js
await client.sync({ store: ['orders'] }, remoteConfig);

client.on('sync:status', s => console.log('Sync status:', s.state));
client.on('sync:change', e => console.log('Δ', e.table, e.type));
```

</details>

