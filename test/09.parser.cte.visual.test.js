import { $describe, $it, testParseAndStringify } from './00.parser.js';

$describe('Parser - CTE Clauses', () => {
    $it('should parse a CTE ... SEARCH clause', async () => {
        await testParseAndStringify('PGSearchClause', `SEARCH DEPTH FIRST BY n SET order_col`);
    });

    $it('should parse a CTE ... CYCLE clause', async () => {
        await testParseAndStringify('PGCycleClause', `CYCLE n SET is_cycle TO TRUE DEFAULT FALSE USING cycle_path`);
    });
});

$describe('Parser - CTE Statements', () => {
    $it('should parse a CTE with simple alias', async () => {
        await testParseAndStringify('CTE', `WITH active_users AS (SELECT * FROM users WHERE active = TRUE) SELECT * FROM active_users`);
    });

    $it('should parse a CTE with compound alias', async () => {
        await testParseAndStringify('CTE', `WITH active_users (x, y) AS (SELECT * FROM users WHERE active = TRUE) SELECT * FROM active_users`);
    });

    $it('should parse a recursive CTE with compound alias', async () => {
        await testParseAndStringify('CTE', `WITH RECURSIVE active_users (x, y) AS (SELECT * FROM users WHERE active = TRUE) SELECT * FROM active_users`);
    });

    $it('should parse a recursive CTE with the MATERIALIZED options', async () => {
        await testParseAndStringify('CTE', `WITH active_users (x, y) AS MATERIALIZED (SELECT * FROM users WHERE active = TRUE) SELECT * FROM active_users`);
    });

    $it('should parse a recursive CTE with the NOT MATERIALIZED options', async () => {
        await testParseAndStringify('CTE', `WITH active_users (x, y) AS NOT MATERIALIZED (SELECT * FROM users WHERE active = TRUE) SELECT * FROM active_users`);
    });

    $it('should parse a recursive CTE with multiple bindings', async () => {
        await testParseAndStringify('CTE', `WITH active_users (x, y) AS NOT MATERIALIZED (SELECT * FROM users WHERE active = TRUE), binding2 AS (SELECT 1) SELECT * FROM active_users`);
    });

    $it('', async () => {
        const sql =
            `SELECT *
FROM (
  WITH TopCustomers AS (
    SELECT
      customer_id,
      total_orders
    FROM orders
    ORDER BY total_orders DESC
    LIMIT 10
  )
  SELECT customer_id
  FROM TopCustomers
) AS ten_best_customers`;
        await testParseAndStringify('CompleteSelectStmt', sql, { prettyPrint: true, autoLineBreakThreshold: 5 });
    });

    $it('should parse INSERT with CTE (WITH clause)', async () => {
        await testParseAndStringify('CTE', "WITH new_users AS (SELECT 1 AS id, 'Alice' AS name) INSERT INTO users SELECT * FROM new_users");
    });

    $it('should parse a DELETE statement with CTE (WITH clause, Postgres)', async () => {
        await testParseAndStringify('CTE', 'WITH old_users AS (SELECT id FROM users WHERE active = FALSE) DELETE FROM users WHERE id IN (SELECT id FROM old_users)', { dialect: 'postgres' });
    });

    $it('should parse UPDATE with CTE (WITH clause)', async () => {
        await testParseAndStringify('CTE', "WITH t AS (SELECT 1 AS val) UPDATE users SET col1 = t.val FROM t WHERE users.id = 1", { dialect: 'postgres' });
    });

    $describe('CTE - SEARCH / CYCLE', () => {
        $it('should parse a CTE with SEARCH clause', async () => {
            const sql =
                `WITH RECURSIVE t (n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1
  FROM t
  WHERE n < 100
) SEARCH DEPTH FIRST BY n SET order_col
SELECT *
FROM t`;
            await testParseAndStringify('CTE', sql, { dialect: 'postgres', prettyPrint: true, autoLineBreakThreshold: 5 });
        });

        $it('should parse a CTE with CYCLE clause', async () => {
            const sql =
                `WITH RECURSIVE t (n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1
  FROM t
  WHERE n < 100
) CYCLE n SET is_cycle TO TRUE DEFAULT FALSE USING cycle_path
SELECT *
FROM t`;
            await testParseAndStringify('CTE', sql, { dialect: 'postgres', prettyPrint: true, autoLineBreakThreshold: 5 });
        });
    });
});
