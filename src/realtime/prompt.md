# 📖 LinkedQL Runtime: FromEngine & Joins

This document defines the **behavioral model**, **AST contract**, and **execution flow** for the `FromEngine` (the core *FROM + JOIN processor* in the LinkedQL worker).  

The `FromEngine` sits at the heart of LinkedQL’s reactive runtime:  
- It consumes **snapshots** and **WAL-driven row changes** from the database.  
- It executes SQL **FROM and JOIN logic incrementally**, producing joined row objects `{ rowId, rowObj }`.  
- It streams these into a **window**, where WHERE clauses and projections are applied.  
- The **app** subscribes directly to window events (`insert | patch | delete`), seeing fully shaped rows with stable `rowId`s.  

Ultimately, this makes SQL queries **reactive**: app-visible query results stay live as the underlying tables change.

---

## 1. System Overview

### Responsibilities

- **Worker**
  - Executes initial query against DB, returns snapshot rows `{ rowId, rowObj }`.
  - Forwards WAL events (insert/update/delete) to `FromEngine`.

- **FromEngine**
  - Accepts query `from_items` and `join_clauses`.
  - Normalizes JOIN clauses (USING → ON, NATURAL → ON).
  - Applies incremental join algorithms (INNER, LEFT, RIGHT, FULL, CROSS).
  - Emits joined rows `{ kind, rowId, rowObj }`.

- **ExprEngine**
  - Evaluates SQL expressions (e.g., ON clauses, WHERE clauses).

- **Window**
  - Applies WHERE condition (post-join).
  - Applies SELECT projection (row shaping).
  - Maintains in-memory window of active rows.
  - Emits changes directly to the app:
    ```js
    { kind: "insert"|"patch"|"delete", rowId, projectedRow }
    ```

- **App**
  - Sees only projected rows with stable `rowId`.
  - Consumes a live stream of query results.

---

## 2. AST Shapes

### FromItem
```js
{
  nodeName: "FROM_ITEM",
  lateral_kw: boolean,
  expr: { nodeName: "TABLE_REF", value: string }, // e.g. "users"
  alias: { nodeName: "FROM_ITEM_ALIAS", value: string, columns?: [{ value: string }, ...] }
}
```

### JoinClause (extends FromItem)

```js
{
  nodeName: "JOIN_CLAUSE",
  expr: { nodeName: "TABLE_REF", value: string },  // RHS table
  alias: { nodeName: "FROM_ITEM_ALIAS", value: string },
  natural_kw: boolean,
  join_type: "CROSS" | "INNER" | "LEFT" | "RIGHT" | "FULL",
  outer_kw: boolean, // decoration (for SQL style)
  condition_clause?: {
    nodeName: "ON_CLAUSE" | "USING_CLAUSE",
    expr?: Expr,                // for ON
    column?: { value: string } | [{ value: string }, ...] // for USING
  }
}
```

### OnClause

```js
{ nodeName: "ON_CLAUSE", expr: Expr }
```

### UsingClause

```js
{ nodeName: "USING_CLAUSE", column: { value: "col1" } | [{ value: "col1"}, ...] }
```

## 3. Normalization Pipeline (inside FromEngine)

When FromEngine receives join_clauses, it normalizes them before execution:

### 1. USING → ON

```js
USING (col1, col2)
```

becomes

```js
ON lhs.col1 = rhs.col1 AND lhs.col2 = rhs.col2
```

### 2. NATURAL JOIN → ON

```js
NATURAL JOIN rhs
```

becomes

```js
ON lhs.commonCol1 = rhs.commonCol1
AND lhs.commonCol2 = rhs.commonCol2
...
```

where commonCol* are the set intersection of columns in lhs and rhs.

### 3. CROSS JOIN

Stays as CROSS (no condition clause).

After normalization, every join has either:

+ join_type: CROSS and no condition, OR

+ join_type: INNER|LEFT|RIGHT|FULL and condition_clause: { nodeName: "ON_CLAUSE", expr: Expr }.

## 4. Execution Flow

### Step 1: Snapshot

+ Worker runs the query with DB:

  ```sql
  SELECT JSON_BUILD_OBJECT(...) AS alias1,
       JSON_BUILD_OBJECT(...) AS alias2,
       ...
       rowId
  FROM ...
  ```
+ Returns rows:
  
  ```js
  { rowId, rowObj: { alias1: {...}, alias2: {...} } }
  ```
+ These are fed directly into the window as the initial state.

### Step 2: WAL updates

+ On WAL insert/update/delete:
  + Worker calls:

    ```js
    fromEngine.push(tableName, row)
    fromEngine.patch(tableName, rowId, row)
    fromEngine.delete(tableName, rowId)
    ```

    + FromEngine:
      + Recomputes joins incrementally.
      + Produces events of form:

        ```js
        { kind: "insert"|"patch"|"delete", rowId, rowObj }
        ```

### Step 3: Window

+ FromEngine output is filtered through WHERE and projected through SELECT.

+ Window maintains a live materialized view, bound to the app.

## 5. RowId Construction

+ Each base row from DB has a stable rowId.

+ Composite rows are concatenated:

  ```js
  `${lhsRowId}${rowIdSeparator}${rhsRowId}`
  ```
+ rowIdSeparator is configurable (default "__").

## 6. Memory Policy

+ FromEngine does not retain rows that fail ON or WHERE.

+ Only rows participating in at least one join chain are cached (minimally) for recomputation.

+ Keeps memory usage bounded.

## 7. Example

```sql
SELECT u.name, o.price
FROM users AS u
LEFT JOIN orders AS o ON u.id = o.user_id
WHERE u.active = true
```

Flow:

+ Snapshot row:

  ```js
  { rowId: "u1__o5", rowObj: { u: {...}, o: {...} } }
  ```

+ WAL delete orders.rowId=o5:

  + LEFT JOIN recomputes → still produces { u: {...}, o: null }.

  + Emits:

  ```js
  { kind: "patch", rowId: "u1__o5", rowObj: { u: {...}, o: null } }
  ```

  + Window applies WHERE, still passes, forwards to app.

## 8. Summary

+ Worker: Query execution + WAL forwarding.

+ FromEngine: FROM + JOIN logic, including JOIN normalization.

+ ExprEngine: Expression evaluation (ON + WHERE).

+ Window: WHERE filtering + projection, app binding.

+ App: Live query results with stable rowIds.