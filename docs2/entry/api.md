---
title: "The Query Interface"
description: "The LinkedQL query interface"
permalink: /entry/api/
nav_order: 4
layout: page
---

# Query Interface

LinkedQL provides a **unified** query interface across all dialects.

---

## `2.1 |` `client.query()`

Primary query API supporting multiple input shapes.

```js
// String query only
const result = await client.query('SELECT * FROM users');

// Query with parameters array
const result = await client.query('SELECT * FROM users WHERE active = $1', [true]);

// Query with parameters and options
const result = await client.query(
  'SELECT * FROM users WHERE created_at > $1',
  [new Date('2024-01-01')],
  { live: true }
);

// Parameters passed through options.values
const result = await client.query(
  'SELECT * FROM users WHERE name = $1',
  { values: ['John'], cache: true }
);
```

---

## `2.2 |` `Result`

Every query returns a `result` object exposing `.rows` and `.rowCount` (alias `.affectedRows`).

```js
// SELECT queries
const result = await client.query('SELECT id, name, email FROM users');
console.log(result.rows);     // [{ id: 1, name: 'John', email: 'john@example.com' }]
console.log(result.rowCount); // 0  (SELECT never affects rows)
```

```js
// INSERT with RETURNING
const result = await client.query(
  'INSERT INTO users (name) VALUES ($1) RETURNING *',
  ['Alice']
);
console.log(result.rows);     // [{ id: 2, name: 'Alice' }]
console.log(result.rowCount); // 0  (.rowCount only applies to non-returning writes)
```

```js
// INSERT without RETURNING
const result = await client.query('INSERT INTO users (name) VALUES ($1)', ['Bob']);
console.log(result.rowCount); // 1  (one row affected)
console.log(result.rows);     // []  (no result set)
```
