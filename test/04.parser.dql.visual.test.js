import { assert, expect } from 'chai';
import { $describe, $it, testParseAndStringify } from './00.parser.js';

$describe('Parser - DQL Clauses', () => {
    $describe('SelectItem', () => {
        $it('should parse a column reference as a select element', async () => {
            await testParseAndStringify('SelectItem', 'my_column');
        });

        $it('should parse an expression as a select element', async () => {
            await testParseAndStringify('SelectItem', 'col1 + col2');
        });

        $it('should parse a select element with an AS alias', async () => {
            await testParseAndStringify('SelectItem', 'my_column AS alias_name');
        });

        $it('should parse a select element with an alias, omitting the AS keyword', async () => {
            await testParseAndStringify('SelectItem', 'my_column alias_name');
        });

        $it('should parse an expression as a select element with an alias', async () => {
            await testParseAndStringify('SelectItem', 'SUM(price) AS total_price');
        });

        $it('should parse an expression of MySQL user variable', async () => {
            await testParseAndStringify('SelectItem', '@a = 1', { dialect: 'mysql' });
        });
    });

    $describe('TableAbstraction3', () => {
        $it('should parse a table reference as a from element', async () => {
            await testParseAndStringify('TableAbstraction3', 'my_table');
        });

        $it('should parse a from element with an AS keyword', async () => {
            await testParseAndStringify('TableAbstraction3', 'my_table AS t');
        });

        $it('should parse a from element with an alias, omitting the AS keyword', async () => {
            await testParseAndStringify('TableAbstraction3', 'my_table t');
        });

        $it('should parse a subquery as a from element with an alias', async () => {
            await testParseAndStringify('TableAbstraction3', '(SELECT 2) AS subq');
        });

        $it('should parse a table reference with an ONLY keyword (inheritance)', async () => {
            await testParseAndStringify('TableAbstraction3', 'ONLY my_parent_table', { dialect: 'postgres' });
            await testParseAndStringify('TableAbstraction3', 'ONLY my_parent_table *', { dialect: 'postgres' });
        });

        $describe('TableAbstraction3 - TABLESAMPLE', () => {
            $it('should parse TABLESAMPLE BERNOULLI', async () => {
                await testParseAndStringify('TableAbstraction3', 'my_table TABLESAMPLE BERNOULLI (20)', { dialect: 'postgres' });
            });

            $it('should parse TABLESAMPLE SYSTEM with REPEATABLE', async () => {
                await testParseAndStringify('TableAbstraction3', 'my_table TABLESAMPLE SYSTEM (50) REPEATABLE (123)', { dialect: 'postgres' });
            });
        });
    });

    $describe('FromClause', () => {
        $it('should parse a simple FROM clause', async () => {
            await testParseAndStringify('FromClause', 'FROM tbl');
        });

        $it('should parse a FROM clause with multiple sources', async () => {
            await testParseAndStringify('FromClause', 'FROM tbl1, tbl2, tbl3');
        });

        $it('should parse a FROM clause with a call expression', async () => {
            await testParseAndStringify('FromClause', 'FROM generate_series(1, 3)');
        });

        $it('should parse a FROM clause with a derived table', async () => {
            await testParseAndStringify('FromClause', 'FROM (SELECT 2)');
        });

        $it('should parse a FROM clause with a VALUES-based derived table', async () => {
            await testParseAndStringify('FromClause', 'FROM (VALUES (2), (1))');
        });

        $it('should parse a complex FROM clause', async () => {
            await testParseAndStringify('FromClause', 'FROM tbl1, generate_series(1, 3), (SELECT 2), (VALUES (2), (1))');
        });

        $it('should parse a complex FROM clause with aliases', async () => {
            await testParseAndStringify('FromClause', 'FROM tbl1 alias1, generate_series(1, 3) alias2, (SELECT 2) AS alias3, (VALUES (2), (1)) AS alias4');
        });

        $it('should parse a complex FROM clause with complex aliases', async () => {
            await testParseAndStringify('FromClause', 'FROM (SELECT 2) AS alias3, (VALUES (2, 3), (1, 3)) AS alias4 (a, b)');
        });

        $it('should parse a complex FROM clause with the LATERAL keyword', async () => {
            await testParseAndStringify('FromClause', 'FROM (SELECT 2) AS alias3, LATERAL (VALUES (2, 3), (1, 3)) AS alias4 (a, b)');
        });

        $it('should parse ROWS FROM with function list and aliases', async () => {
            await testParseAndStringify('FromClause', 'FROM ROWS FROM(func1(), func2()) AS funcs (a, b)', { dialect: 'postgres' });
        });

        $it('should parse ROWS FROM with WITH ORDINALITY', async () => {
            await testParseAndStringify('FromClause', 'FROM ROWS FROM(func1(), func2()) WITH ORDINALITY', { dialect: 'postgres' });
        });
    });

    $describe('JoinClause', () => {
        $it('should parse an ON clause with a simple condition', async () => {
            await testParseAndStringify('OnClause', 'ON a.id = b.id');
            await testParseAndStringify('OnClause', 'ON a.id = b.id AND a.status = \'active\'');
        });

        $it('should parse the USING clause both with a simple condition and a complex one', async () => {
            await testParseAndStringify('UsingClause', 'USING (common_col)');
            await testParseAndStringify('UsingClause', 'USING (col1, col2)');
        });

        $it('should parse an "INNER" JOIN clause', async () => {
            await testParseAndStringify('JoinClause', 'INNER JOIN tbl2 ON tbl2.col1 = tbl1.col1');
            await testParseAndStringify('JoinClause', 'JOIN tbl2 ON tbl2.col1 = tbl1.col1');
            await testParseAndStringify('JoinClause', 'JOIN tbl2 USING (col1, col2)');
        });

        $it('should parse a "LEFT|RIGHT|FULL" JOIN clause', async () => {
            await testParseAndStringify('JoinClause', 'LEFT JOIN tbl2 ON tbl2.col1 = tbl1.col1');
            await testParseAndStringify('JoinClause', 'RIGHT JOIN tbl2 ON tbl2.col1 = tbl1.col1');
            await testParseAndStringify('JoinClause', 'FULL JOIN tbl2 ON tbl2.col1 = tbl1.col1');
            expect(testParseAndStringify('JoinClause', 'FULL JOIN tbl2 ON tbl2.col1 = tbl1.col1', { dialect: 'mysql', assert: true })).to.be.rejected;
        });

        $it('should parse a LEFT|RIGHT|FULL "OUTER" JOIN clause', async () => {
            await testParseAndStringify('JoinClause', 'LEFT OUTER JOIN tbl2 ON tbl2.col1 = tbl1.col1');
            await testParseAndStringify('JoinClause', 'RIGHT OUTER JOIN tbl2 ON tbl2.col1 = tbl1.col1');
            await testParseAndStringify('JoinClause', 'FULL OUTER JOIN tbl2 ON tbl2.col1 = tbl1.col1');
        });

        $it('should parse a "NATURAL" [LEFT|RIGHT|FULL [OUTER]] JOIN clause with an ON/USING clause rejected', async () => {
            await testParseAndStringify('JoinClause', 'NATURAL JOIN tbl2');
            expect(testParseAndStringify('JoinClause', 'NATURAL JOIN tbl2 ON tbl2.col1 = tbl1.col1')).to.be.rejected;
            await testParseAndStringify('JoinClause', 'NATURAL INNER JOIN tbl2');
            expect(testParseAndStringify('JoinClause', 'NATURAL INNER JOIN tbl2 ON tbl2.col1 = tbl1.col1')).to.be.rejected;
            await testParseAndStringify('JoinClause', 'NATURAL LEFT OUTER JOIN tbl2');
            expect(testParseAndStringify('JoinClause', 'NATURAL LEFT OUTER JOIN tbl2 ON tbl2.col1 = tbl1.col1')).to.be.rejected;
            await testParseAndStringify('JoinClause', 'NATURAL RIGHT OUTER JOIN tbl2');
            expect(testParseAndStringify('JoinClause', 'NATURAL RIGHT OUTER JOIN tbl2 ON tbl2.col1 = tbl1.col1')).to.be.rejected;
            await testParseAndStringify('JoinClause', 'NATURAL FULL OUTER JOIN tbl2');
            expect(testParseAndStringify('JoinClause', 'NATURAL FULL OUTER JOIN tbl2 ON tbl2.col1 = tbl1.col1')).to.be.rejected;
        });

        $it('should parse a "CROSS" JOIN clause with an ON/USING clause rejected', async () => {
            await testParseAndStringify('JoinClause', 'CROSS JOIN tbl2');
            expect(testParseAndStringify('JoinClause', 'CROSS JOIN tbl2 ON tbl2.col1 = tbl1.col1')).to.be.rejected;
        });

        $it('should parse a subquery JOIN clause', async () => {
            await testParseAndStringify('JoinClause', 'LEFT JOIN (SELECT tbl2) AS j ON tbl2.col1 = tbl1.col1');
        });
    });

    $describe('WhereClause', () => {
        $it('should parse a simple WHERE clause', async () => {
            await testParseAndStringify('WhereClause', 'WHERE id = 1');
        });

        $it('should parse a complex WHERE clause with logical operators', async () => {
            await testParseAndStringify('WhereClause', 'WHERE (age > 18 AND status = \'active\') OR (city = \'NY\' AND zip IS NOT NULL)');
        });
    });

    $describe('OrderByClause', () => {
        $it('should parse ORDER BY with single column ASC', async () => {
            await testParseAndStringify('OrderByClause', 'ORDER BY col1 ASC');
        });

        $it('should parse ORDER BY with multiple columns and mixed directions', async () => {
            await testParseAndStringify('OrderByClause', 'ORDER BY col1 DESC, col2 ASC');
        });

        $it('should parse ORDER BY with NULLS FIRST/LAST', async () => {
            await testParseAndStringify('OrderByClause', 'ORDER BY col1 ASC NULLS LAST');
            await testParseAndStringify('OrderByClause', 'ORDER BY col2 DESC NULLS FIRST');
        });

        $it('should parse ORDER BY with USING operator (PostgreSQL)', async () => {
            await testParseAndStringify('OrderByClause', 'ORDER BY text_col USING *', { dialect: 'postgres' });
        });
    });

    $describe('GroupByClause', () => {
        $it('should parse GROUP BY with single column', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY col1');
        });

        $it('should parse GROUP BY with multiple columns', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY col1, col2');
        });

        $it('should parse GROUP BY with WITH ROLLUP (MySQL)', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY col1, col2 WITH ROLLUP', { dialect: 'mysql' });
        });

        $it('should parse GROUP BY ROLLUP', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY ROLLUP (region, product)', { dialect: 'postgres' });
        });

        $it('should parse GROUP BY CUBE', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY CUBE (region, product)', { dialect: 'postgres' });
        });

        $it('should parse GROUP BY GROUPING SETS with expressions', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY GROUPING SETS ((region), (product))', { dialect: 'postgres' });
        });

        $it('should parse GROUPING SETS with nested ROLLUP', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY GROUPING SETS (ROLLUP (region, product), (country))', { dialect: 'postgres' });
        });

        $it('should parse empty GROUPING element', async () => {
            await testParseAndStringify('GroupByClause', 'GROUP BY ()', { dialect: 'postgres' });
        });
    });

    $describe('HavingClause', () => {
        $it('should parse a simple HAVING clause', async () => {
            await testParseAndStringify('HavingClause', 'HAVING id = 1');
        });

        $it('should parse a complex HAVING clause with logical operators', async () => {
            await testParseAndStringify('HavingClause', 'HAVING (age > 18 AND status = \'active\') OR (city = \'NY\' AND zip IS NOT NULL)');
        });
    });

    $describe('WindowClause', () => {
        $it('should parse a single named window definition', async () => {
            await testParseAndStringify('WindowClause', 'WINDOW my_window AS (PARTITION BY region ORDER BY sales DESC)');
        });

        $it('should parse multiple named window definitions', async () => {
            await testParseAndStringify('WindowClause', 'WINDOW w1 AS (PARTITION BY a), w2 AS (ORDER BY b)');
        });

        $it('should parse named window with inheritance', async () => {
            await testParseAndStringify('WindowClause', 'WINDOW w1 AS (PARTITION BY a), w2 AS (w1 ORDER BY b)');
        });

        $it('should parse ROWS frame clause', async () => {
            await testParseAndStringify('WindowClause', `WINDOW w AS (PARTITION BY dept ORDER BY salary ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`, { dialect: 'postgres' });
        });

        $it('should parse RANGE frame clause', async () => {
            await testParseAndStringify('WindowClause', `WINDOW w AS (ORDER BY salary RANGE BETWEEN 100 PRECEDING AND 100 FOLLOWING)`, { dialect: 'postgres' });
        });

        $describe('WindowClause - Frame Exclude Options', () => {
            $it('should parse ROWS frame clause with EXCLUDE CURRENT ROW', async () => {
                await testParseAndStringify('WindowClause', `WINDOW w AS (PARTITION BY dept ORDER BY salary ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW EXCLUDE CURRENT ROW)`, { dialect: 'postgres' });
            });

            $it('should parse RANGE frame clause with EXCLUDE GROUP', async () => {
                await testParseAndStringify('WindowClause', `WINDOW w AS (ORDER BY salary RANGE BETWEEN 100 PRECEDING AND 100 FOLLOWING EXCLUDE GROUP)`, { dialect: 'postgres' });
            });

            $it('should parse GROUPS frame clause with EXCLUDE TIES', async () => {
                await testParseAndStringify('WindowClause', `WINDOW w AS (ORDER BY id GROUPS BETWEEN 1 PRECEDING AND 1 FOLLOWING EXCLUDE TIES)`, { dialect: 'postgres' });
            });

            $it('should parse ROWS frame clause with EXCLUDE NO OTHERS', async () => {
                await testParseAndStringify('WindowClause', `WINDOW w AS (ORDER BY id ROWS BETWEEN 5 PRECEDING AND 5 FOLLOWING EXCLUDE NO OTHERS)`, { dialect: 'postgres' });
            });
        });
    });

    $describe('LimitClause', () => {
        $it('should parse a simple LIMIT clause', async () => {
            await testParseAndStringify('LimitClause', 'LIMIT 1');
        });

        $it('should parse a complex LIMIT clause', async () => {
            await testParseAndStringify('LimitClause', 'LIMIT 3 + 4');
        });

        $it('should parse a complex LIMIT clause on postgres', async () => {
            await testParseAndStringify('LimitClause', 'LIMIT (ee)', { dialect: 'postgres' });
        });

        $it('should parse a two-part LIMIT clause on mysql', async () => {
            await testParseAndStringify('LimitClause', 'LIMIT 33, 40', { dialect: 'mysql' });
        });
    });

    $describe('OffsetClause', () => {
        $it('should parse a simple OFFSET clause', async () => {
            await testParseAndStringify('OffsetClause', 'OFFSET 1');
        });

        $it('should parse a complex OFFSET clause', async () => {
            await testParseAndStringify('OffsetClause', 'OFFSET 3 + 4');
        });

        $it('should parse a complex OFFSET clause on postgres', async () => {
            await testParseAndStringify('OffsetClause', 'OFFSET 3 ROWS', { dialect: 'postgres' });
            await testParseAndStringify('OffsetClause', 'OFFSET 3 ROW', { dialect: 'postgres' });
            await testParseAndStringify('OffsetClause', 'OFFSET (SELECT 2)', { dialect: 'postgres' });
        });
    });

    $describe('PGFetchClause', () => {
        $it('should parse a simple FETCH clause', async () => {
            await testParseAndStringify('PGFetchClause', 'FETCH FIRST 1 ROW ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH NEXT 1 ROW ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH FIRST 1 ROW ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH NEXT 1 ROW ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH FIRST 1 ROWS ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH NEXT 1 ROWS ONLY', { dialect: 'postgres' });
        });

        $it('should parse a complex FETCH clause', async () => {
            await testParseAndStringify('PGFetchClause', 'FETCH FIRST 1 + 2 ROWS ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH NEXT 1 + 2 ROWS ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH FIRST 1 + 2 ROWS WITH TIES', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH NEXT 1 + 2 ROWS WITH TIES', { dialect: 'postgres' });
        });

        $it('should parse a complex level 2 FETCH clause', async () => {
            await testParseAndStringify('PGFetchClause', 'FETCH FIRST (SELECT 2) ROWS ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH NEXT (SELECT 2) ROWS ONLY', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH FIRST (SELECT 2) ROWS WITH TIES', { dialect: 'postgres' });
            await testParseAndStringify('PGFetchClause', 'FETCH NEXT (SELECT 2) ROWS WITH TIES', { dialect: 'postgres' });
        });
    });

    $describe('ForClause', () => {
        $it('should parse a basic FOR clause', async () => {
            await testParseAndStringify('ForClause', `FOR UPDATE`);
            await testParseAndStringify('ForClause', `FOR SHARE`);
        });

        $it('should parse a fine-grained FOR clause', async () => {
            await testParseAndStringify('ForClause', `FOR UPDATE NOWAIT`);
            await testParseAndStringify('ForClause', `FOR UPDATE SKIP LOCKED`);
            await testParseAndStringify('ForClause', `FOR SHARE NOWAIT`);
            await testParseAndStringify('ForClause', `FOR SHARE SKIP LOCKED`);
        });

        $it('should parse a fine-grained FOR KEY|NO KEY clause', async () => {
            await testParseAndStringify('ForClause', `FOR NO KEY UPDATE`);
            await testParseAndStringify('ForClause', `FOR NO KEY UPDATE SKIP LOCKED`);
            await testParseAndStringify('ForClause', `FOR KEY SHARE`);
            await testParseAndStringify('ForClause', `FOR KEY SHARE SKIP LOCKED`);
        });

        $it('should parse a fine-grained FOR clause with table names', async () => {
            await testParseAndStringify('ForClause', `FOR NO KEY UPDATE OF tbl1, tbl2 NOWAIT`);
            await testParseAndStringify('ForClause', `FOR NO KEY UPDATE OF tbl1, tbl2 SKIP LOCKED`);
            await testParseAndStringify('ForClause', `FOR KEY SHARE OF tbl1, tbl2 NOWAIT`);
            await testParseAndStringify('ForClause', `FOR KEY SHARE OF tbl1, tbl2 SKIP LOCKED`);
        });
    });
});

$describe('Parser - DQL Statements', () => {
    $describe('CompleteSelectStmt', () => {
        $it('should parse a simple SELECT statement', async () => {
            await testParseAndStringify('CompleteSelectStmt', 'SELECT 2');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT 2 + 2 alias');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT 2 + 2 AS alias');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT col alias1, 2 alias2');
        });

        $it('should parse a simple SELECT ALL|DISTINCT statement', async () => {
            await testParseAndStringify('CompleteSelectStmt', 'SELECT ALL 2');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT ALL 2 + 2 alias');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT DISTINCT 2 + 2 AS alias');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT DISTINCT col alias1, 2 alias2');
        });

        $it('should parse a simple SELECT DISTINCT ON statement for postgres', async () => {
            await testParseAndStringify('CompleteSelectStmt', 'SELECT DISTINCT ON (first_name) 2 + 2 AS alias', { dialect: 'postgres' });
            await testParseAndStringify('CompleteSelectStmt', 'SELECT DISTINCT ON (first_name, last_name) 2 + 2 AS alias', { dialect: 'postgres' });
        });

        $it('should parse a simple SELECT ... FROM statement', async () => {
            await testParseAndStringify('CompleteSelectStmt', 'SELECT 2 FROM tbl1 tbl1, tbl2 tbl2');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT 2 + 2 alias');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT 2 + 2 AS alias');
            await testParseAndStringify('CompleteSelectStmt', 'SELECT col alias1, 70 - 2 alias2');
        });

        $it('should parse a SELECT statement with arbitrary clauses', async () => {
            await testParseAndStringify('CompleteSelectStmt', `SELECT region, COUNT(*) FROM sales WHERE amount > 100 GROUP BY region HAVING COUNT(*) > 5`);
            await testParseAndStringify('CompleteSelectStmt', `SELECT id, named FROM users ORDER BY named ASC LIMIT 2, 10`, { dialect: 'mysql' });
            await testParseAndStringify('CompleteSelectStmt', `SELECT id, @a := 1, @b := 2, named FROM users ORDER BY named ASC LIMIT 2, 10`, { dialect: 'mysql' });
            await testParseAndStringify('CompleteSelectStmt', `SELECT * FROM products ORDER BY price FETCH FIRST 3 ROWS WITH TIES`, { dialect: 'postgres' });
            await testParseAndStringify('CompleteSelectStmt', `SELECT id, RANK() OVER win FROM employees WINDOW win AS (PARTITION BY department ORDER BY salary DESC)`);
            await testParseAndStringify('CompleteSelectStmt', `SELECT * FROM users u LEFT JOIN LATERAL (SELECT * FROM logins l WHERE l.user_id = u.id ORDER BY login_at DESC LIMIT 1) AS recent ON TRUE`);
            await testParseAndStringify('CompleteSelectStmt', `SELECT * FROM departments NATURAL JOIN employees`);
            await testParseAndStringify('CompleteSelectStmt', `SELECT * FROM (VALUES (1, 'a'), (2, 'b')) AS pairs (id, label)`);
            await testParseAndStringify('CompleteSelectStmt', `SELECT named, (SELECT COUNT(*) FROM logins WHERE user_id = users.id) AS login_count FROM users`);
            await testParseAndStringify('CompleteSelectStmt', `SELECT region, product, GROUPING(region) AS is_region_grouped, GROUPING(product) AS is_product_grouped FROM sales GROUP BY CUBE (region, product)`, { dialect: 'postgres' });
        });
    });

    $describe('CompositeSelectStmt: UNION[ALL]|INTERSECT|EXCEPT', () => {
        $it('should parse a set operation with SELECT', async () => {
            await testParseAndStringify('CompositeSelectStmt', `(SELECT id FROM admins) UNION (SELECT id FROM users)`);
            await testParseAndStringify('CompositeSelectStmt', `(SELECT id FROM admins) UNION ALL (SELECT id FROM users)`);
            await testParseAndStringify('CompositeSelectStmt', `(SELECT id FROM admins) UNION ALL SELECT id FROM users`);
            await testParseAndStringify('CompositeSelectStmt', `SELECT id FROM admins INTERSECT SELECT id FROM users`);
            await testParseAndStringify('CompositeSelectStmt', `SELECT id FROM admins EXCEPT SELECT id FROM users`);
        });

        $it('should parse a set operation with SELECT and arbitray set-expressions', async () => {
            await testParseAndStringify('CompositeSelectStmt', `(VALUES (x), (y)) UNION (SELECT id FROM users)`);
            await testParseAndStringify('CompositeSelectStmt', `generate_series(x, y) UNION ALL (SELECT id FROM users)`);
        });

        $describe('CompositeSelectStmt - post-set ORDER BY/LIMIT', () => {
            $it('should parse UNION with ORDER BY and LIMIT', async () => {
                await testParseAndStringify('CompositeSelectStmt', `(SELECT id FROM a) UNION ALL (SELECT id FROM b) ORDER BY id DESC LIMIT 5`, { dialect: 'postgres' });
            });

            $it('should parse INTERSECT with ORDER BY and OFFSET', async () => {
                await testParseAndStringify('CompositeSelectStmt', `(SELECT id FROM a) INTERSECT SELECT id FROM b ORDER BY id OFFSET 2`, { dialect: 'postgres' });
            });
        });
    });

    $describe('TableStatement (PostgreSQL specific)', () => {
        $it('should parse a TABLE statement', async () => {
            await testParseAndStringify('TableStmt', 'TABLE my_table', { dialect: 'postgres' });
        });

        $it('should parse a TABLE "ONLY" statement', async () => {
            await testParseAndStringify('TableStmt', 'TABLE ONLY my_table *', { dialect: 'postgres' });
        });

        $it('should parse a TABLE statement with qualified name', async () => {
            await testParseAndStringify('TableStmt', 'TABLE public.my_table', { dialect: 'postgres' });
        });
    });
});
