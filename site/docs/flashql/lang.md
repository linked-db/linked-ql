# Language Reference

This is FlashQL's SQL implemenation reference.

::: warning TODO
This reference is pending restructure and update.
:::

### 1. Statements

| Clause / Construct                  |   Dialect  | Support | Notes                                  |
| :---------------------------------- | :--------: | :-----: | :------------------------------------- |
| `SELECT`                            | PG / MySQL |    ✅    | Full projection, aliasing, expressions |
| `INSERT`                            | PG / MySQL |    ✅    | Multi-row, `RETURNING` supported       |
| `UPDATE`                            | PG / MySQL |    ✅    | `SET` with expressions                 |
| `DELETE`                            | PG / MySQL |    ✅    | Conditional deletes                    |
| `UPSERT` (`INSERT ... ON CONFLICT`) |     PG     |    ✅    | Native unified syntax                  |
| `MERGE`                             |    ANSI    |    ⛔    | Not planned                            |
| `WITH` (CTE)                        |     PG     |    ✅    | Recursive unsupported                  |
| `UNION` / `INTERSECT` / `EXCEPT`    |    ANSI    |    ✅    | Standard behavior                      |
| `CREATE TABLE`                      |    ANSI    |    ✅    | Basic schema only                      |
| `ALTER TABLE`                       |    ANSI    |    ✅    | Add/drop columns                       |
| `DROP TABLE`                        |    ANSI    |    ✅    | Cascade optional                       |
| `CREATE INDEX`                      |     PG     |    ⛔    | Internally optimized only              |
| `CREATE VIEW`                       |    ANSI    |    ⛔    | Planned                                |
| `TRUNCATE`                          | PG / MySQL |    ⛔    | Not needed for in-memory engine        |
| `BEGIN` / `COMMIT` / `ROLLBACK`     |    ANSI    |    ⛔    | Transaction semantics implicit         |
| `SHOW` / `DESCRIBE`                 |    MySQL   |    🔶   | Parsed as metadata query only          |

---

### 2. Expressions

| Construct                           |  Dialect | Support | Notes                            |
| :---------------------------------- | :------: | :-----: | :------------------------------- |
| Column references                   |   ANSI   |    ✅    | Standard, dotted paths supported |
| Literals (numeric, string, boolean) |   ANSI   |    ✅    | –                                |
| `NULL`, `IS NULL`, `IS NOT NULL`    |   ANSI   |    ✅    | –                                |
| Subqueries (scalar, row, table)     |   ANSI   |    ✅    | Nested query support             |
| `CASE`, `COALESCE`, `NULLIF`        |   ANSI   |    ✅    | Conditional expressions          |
| `EXISTS`, `IN`, `ANY`, `ALL`        |   ANSI   |    ✅    | Standard semantics               |
| JSON literals `{}`, `[]`            |  FlashQL |    ✅    | Native JSON support              |
| DeepRefs `~>`, `<~`                 | LinkedQL |    ✅    | Referential traversal            |
| Time/version tags `@`               |  FlashQL |    ✅    | Temporal version addressing      |
| Window functions                    |    PG    |    ⛔    | Planned                          |
| User-defined expressions            |  FlashQL |    ⛔    | Future extension                 |

---

### 3. Operators

| Operator                              |  Dialect  |       Support      | Notes                       |   |                      |
| :------------------------------------ | :-------: | :----------------: | :-------------------------- | - | -------------------- |
| `+`, `-`, `*`, `/`, `%`               |    ANSI   |          ✅         | Arithmetic                  |   |                      |
| `=`, `<>`, `!=`, `<`, `>`, `<=`, `>=` |    ANSI   |          ✅         | Comparisons                 |   |                      |
| `AND`, `OR`, `NOT`                    |    ANSI   |          ✅         | Logical                     |   |                      |
| `                                     |           |     `, `CONCAT`    | PG / MySQL                  | ✅ | String concatenation |
| `LIKE`, `ILIKE`                       | ANSI / PG |          ✅         | Pattern matching            |   |                      |
| `IN`, `NOT IN`                        |    ANSI   |          ✅         | Set membership              |   |                      |
| `BETWEEN`, `NOT BETWEEN`              |    ANSI   |          ✅         | Range                       |   |                      |
| `~>`, `<~`                            |  LinkedQL |          ✅         | Deep reference traversal    |   |                      |
| `@>` / `<@`                           |  PG JSON  |         🔶         | Partial JSON containment    |   |                      |
| `->`, `->>`                           |  PG JSON  |         🔶         | Alias of native JSON access |   |                      |
| `#>`                                  |  PG JSON  |          ⛔         | Not yet implemented         |   |                      |
| `IS DISTINCT FROM`                    |     PG    |          ⛔         | Planned                     |   |                      |
| `                                     |           | ` (logical concat) | MySQL                       | ⛔ | Not applicable       |

---

### 4. Functions

| Function                                    |   Dialect  | Support | Notes                    |
| :------------------------------------------ | :--------: | :-----: | :----------------------- |
| `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`         |    ANSI    |    ✅    | Aggregates               |
| `LOWER`, `UPPER`, `LENGTH`, `TRIM`          |    ANSI    |    ✅    | String functions         |
| `SUBSTRING`, `CONCAT`, `REPLACE`            |    ANSI    |    ✅    | –                        |
| `ABS`, `ROUND`, `CEIL`, `FLOOR`             |    ANSI    |    ✅    | Numeric                  |
| `NOW`, `CURRENT_DATE`, `INTERVAL`           |  ANSI / PG |    ✅    | Date/time                |
| `COALESCE`, `NULLIF`, `CASE`                |    ANSI    |    ✅    | Conditional              |
| `JSON_EXTRACT`, `JSON_OBJECT`, `JSON_ARRAY` |   FlashQL  |    ✅    | JSON built-ins           |
| `ARRAY_AGG`, `STRING_AGG`                   |     PG     |    ✅    | Aggregates               |
| `GREATEST`, `LEAST`                         | PG / MySQL |    ✅    | –                        |
| `RANDOM`, `UUID`                            |     PG     |    ✅    | Random utilities         |
| `ROW_NUMBER`, `RANK`, `DENSE_RANK`          |     PG     |    ⛔    | Window functions planned |
| Custom functions                            |   FlashQL  |    ⛔    | Future extension API     |

---

### 5. Dialect Compatibility

| Dialect        | Grammar | Runtime | Notes                                            |
| :------------- | :-----: | :-----: | :----------------------------------------------- |
| PostgreSQL     |    ✅    |    ✅    | Canonical dialect                                |
| MySQL          |    ✅    |    🔶   | Normalized differences (e.g., `LIMIT` vs. `TOP`) |
| MariaDB        |    ✅    |    🔶   | Same as MySQL                                    |
| SQLite         |    🔶   |    ✅    | Parsed via FlashQL runtime grammar               |
| FlashQL Native |    ✅    |    ✅    | Adds JSON literals, DeepRefs, and temporal tags  |
