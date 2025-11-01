---
title: "JSON Literals"
description: "LinkedQL’s JSON literal syntax — native object and array literals within SQL expressions."
permalink: /lang/json-literals/
nav_order: 2
layout: page
---

# ≫ JSON Literals

*Express shapes like you're writing JSON.*

```sql
SELECT { email, mobile: phone } AS contact FROM users;
```

LinkedQL translates that to its dialect-native JSON function:
`JSON_BUILD_OBJECT()` / `JSON_OBJECT()`.

---

## Table of Contents

<details open><summary>Show</summary>

* [Overview](#overview)
* [` 1 |` Modeling Objects and Arrays](#-1--modeling-objects-and-arrays)

  * [`1.1 |` Object Literals (`{ ... }`)](#11--object-literals---)
  * [`1.2 |` Array Literals (`[ ... ]`)](#12--array-literals---)
* [` 2 |` Aggregation Syntax](#-2--aggregation-syntax)

  * [`2.1 |` Postfixed Aliases](#21--postfixed-aliases)
  * [`2.2 |` Collection Fields](#22--collection-fields)
  * [`2.3 |` Grouping rules (PostgreSQL & MySQL)](#23--grouping-rules-postgresql--mysql)
* [` 3 |` Composition & Integration](#-3--composition--integration)

  * [`3.1 |` Nesting](#31--nesting)
  * [`3.2 |` DeepRefs](#32--deeprefs)
* [Appendix A — Dialect Equivalents](#appendix-a--dialect-equivalents)

</details>

## Overview

SQL’s deep JSON integration has long come through **functions** —
`JSON_BUILD_OBJECT()`, `JSON_BUILD_ARRAY()`, and `JSON_AGG()` in PostgreSQL;
`JSON_OBJECT()`, `JSON_ARRAY()`, and `JSON_ARRAYAGG()` in MySQL.

The problem is: their imperative nature often complicates their core use case — **modeling structure**.
Instead of enabling a mental model of shape, they force you to think procedurally — diverging from how we actually reason about structure and how we already represent it across languages.

LinkedQL addresses this with first-class support for **JSON literals**.<br>
These let you express structure the way you’d write JSON itself — each *being* the structure itself rather than an instruction for how to construct it.

The result is SQL that’s *actually* understood.

JSON literals are purely syntactic conveniences for their function counterparts:

| Literal      | PostgreSQL Function   | MySQL Function    |
| :----------- | :-------------------- | :---------------- |
| `{ ... }`    | `JSON_BUILD_OBJECT()` | `JSON_OBJECT()`   |
| `[ ... ]`    | `JSON_BUILD_ARRAY()`  | `JSON_ARRAY()`    |
| `AS alias[]` | `JSON_AGG()`          | `JSON_ARRAYAGG()` |

They’re much like what `->` and `->>` are to their own functional equivalents:

| Operator | PostgreSQL Function        | MySQL Function                 |
| :------- | :------------------------- | :----------------------------- |
| `->`     | `json_extract_path()`      | `JSON_EXTRACT()`               |
| `->>`    | `json_extract_path_text()` | `JSON_UNQUOTE(JSON_EXTRACT())` |

---

## ` 1 |` Modeling Objects and Arrays

In place of long function calls, object and array literals make modeling structure in SQL concise and expressive.

### `1.1 |` Object Literals (`{ ... }`)

The object notation `{ ... }` is an expression that resolves to exactly what it looks like —
a JSON object of the same form. Under the hood, it expands to `JSON_BUILD_OBJECT()` in PostgreSQL, and `JSON_OBJECT()` in MySQL.

```sql
SELECT { name: full_name, email: email } AS user
FROM users;
```

```sql
SELECT JSON_BUILD_OBJECT('name', full_name, 'email', email)
FROM users;
```

If you omit the key, the column name becomes the key automatically.

```sql
SELECT { full_name, email } AS user
FROM users;
```

Object literals can appear in projections, expressions, or subqueries — anywhere their function counterparts can.

---

### `1.2 |` Array Literals (`[ ... ]`)

The array notation `[ ... ]` is an expression that resolves to a JSON array — an ordered list of values. Under the hood, it expands to `JSON_BUILD_ARRAY()` in PostgreSQL, and `JSON_ARRAY()` in MySQL.

```sql
SELECT [ full_name, email ] AS contact_list
FROM users;
```

```sql
SELECT JSON_BUILD_ARRAY(full_name, email)
FROM users;
```

Arrays, like objects, can appear wherever their function counterparts can.

---

## ` 2 |` Aggregation Syntax

In place of explicit aggregation functions, LinkedQL lets you declare an aggregated result using the postfix *collection* notation.

### `2.1 |` Postfixed Aliases

Annotate output aliases with the postfix *collection* notation — `alias[]` — to aggregate expressions into collections.

This is a shorthand for `JSON_AGG()`, or `JSON_ARRAYAGG()` in MySQL.

```sql
SELECT
  u.id,
  u.title AS titles[]
FROM users AS u
LEFT JOIN posts AS p ON p.author = u.id
GROUP BY u.id;
```

```sql
SELECT
  u.id,
  JSON_AGG(u.title) AS titles
FROM users AS u
LEFT JOIN posts AS p ON p.author = u.id
GROUP BY u.id;
```

`titles` becomes an array containing all `title` values for that group.

### `2.2 |` Collection Fields

Like the previous, annotate object fields with the postfix *collection* notation — `key[]` — to aggregate expressions into collections.

```sql
SELECT
  u.id,
  { name, posts[]: { id: p.id, title: p.title } } AS profile
FROM users AS u
LEFT JOIN posts AS p ON p.author = u.id
GROUP BY u.id, u.name;
```

This form aggregates each user’s posts into a single object literal, producing nested, relational JSON structures inline.

### `2.3 |` Grouping Rules (PostgreSQL & MySQL)

LinkedQL’s aggregation syntax doesn’t alter SQL’s grouping rules.

* In **PostgreSQL**, all non-aggregated columns must appear in `GROUP BY`.
* In **MySQL**, when `ONLY_FULL_GROUP_BY` is enabled (recommended), the same rule applies.

It simplifies **expression**, not semantics.

An exception to this rule appears in [DeepRefs](/linked-ql/lang/deeprefs#112-backrefs-) — where the aggregation syntax isolates its own grouping semantics from the main query.

---

## ` 3 |` Composition & Integration

JSON literals are first-class expressions in LinkedQL’s language surface;
they nest within each other and integrate seamlessly with relational constructs like DeepRefs.

### `3.1 |` Nesting

Objects and arrays can nest freely, allowing structured projections of any shape.

```sql
SELECT
  id,
  {
    name,
    contact: { email, phone },
    tags: [ tag1, tag2 ]
  } AS profile
FROM users;
```

### `3.2 |` DeepRefs

JSON literals compose with [DeepRefs](/linked-ql/lang/deeprefs) to model relationships structurally.

```sql
SELECT
  p.id,
  p.title,
  p.author ~> { id, name, email } AS author,
  { comments[]: (post <~ comments) ~> { id, text } } AS related
FROM posts AS p;
```

---

## Appendix A — Dialect Equivalents

| LinkedQL Form       | PostgreSQL                                   | MySQL                                       |
| :------------------ | :------------------------------------------- | :------------------------------------------ |
| `{ a, b: x }`       | `JSON_BUILD_OBJECT('a', a, 'b', x)`          | `JSON_OBJECT('a', a, 'b', x)`               |
| `[ a, b ]`          | `JSON_BUILD_ARRAY(a, b)`                     | `JSON_ARRAY(a, b)`                          |
| `expr AS list[]`    | `JSON_AGG(expr) AS list`                     | `JSON_ARRAYAGG(expr) AS list`               |
| `{ items[]: expr }` | `JSON_BUILD_OBJECT('items', JSON_AGG(expr))` | `JSON_OBJECT('items', JSON_ARRAYAGG(expr))` |

