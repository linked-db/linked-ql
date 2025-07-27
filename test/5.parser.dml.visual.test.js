import { $describe, $it, testParseAndStringify } from './0.parser.js';

$describe('Parser - DML Clauses', () => {
    $describe('SetClause', () => {
        $it('should parse SET with single column assignment', async () => {
            await testParseAndStringify('SetClause', 'SET col1 = 1');
        });

        $it('should parse SET with qualified single column assignment', async () => {
            await testParseAndStringify('SetClause', 'SET tbl.col1 = 1');
        });

        $it('should parse SET with multiple column assignments', async () => {
            await testParseAndStringify('SetClause', 'SET col1 = 1, col2 = 2');
        });

        $it('should parse SET with row assignment', async () => {
            await testParseAndStringify('SetClause', 'SET (col1, col2) = (SELECT a, b FROM t)', { dialect: 'postgres' });
        });

        $it('should parse SET with subquery assignment', async () => {
            await testParseAndStringify('SetClause', 'SET col1 = (SELECT MAX(val) FROM t)', { dialect: 'postgres' });
        });

        $it('should parse SET with expression', async () => {
            await testParseAndStringify('SetClause', 'SET col1 = col1 + 1', { dialect: 'mysql' });
        });

        $it('should parse SET with DEFAULT keyword', async () => {
            await testParseAndStringify('SetClause', 'SET col1 = DEFAULT', { dialect: 'mysql' });
        });

        $it('should parse SET with NULL', async () => {
            await testParseAndStringify('SetClause', 'SET col1 = NULL', { dialect: 'mysql' });
        });
    });

    $describe('UsingFromClause - DELETE', () => {
        $it('should parse a simple USING clause', async () => {
            await testParseAndStringify('UsingFromClause', 'USING tbl');
        });

        $it('should parse a USING clause with multiple sources', async () => {
            await testParseAndStringify('UsingFromClause', 'USING tbl1, tbl2, tbl3');
        });

        $it('should parse a USING clause with a call expression', async () => {
            await testParseAndStringify('UsingFromClause', 'USING generate_series(1, 3)');
        });

        $it('should parse a USING clause with a derived table', async () => {
            await testParseAndStringify('UsingFromClause', 'USING (SELECT 2)');
        });

        $it('should parse a USING clause with a VALUES-based derived table', async () => {
            await testParseAndStringify('UsingFromClause', 'USING (VALUES (2), (1))');
        });

        $it('should parse a complex USING clause', async () => {
            await testParseAndStringify('UsingFromClause', 'USING tbl1, generate_series(1, 3), (SELECT 2), (VALUES (2), (1))');
        });

        $it('should parse a complex USING clause with aliases', async () => {
            await testParseAndStringify('UsingFromClause', 'USING tbl1 alias1, generate_series(1, 3) alias2, (SELECT 2) AS alias3, (VALUES (2), (1)) AS alias4');
        });

        $it('should parse a complex USING clause with complex aliases', async () => {
            await testParseAndStringify('UsingFromClause', 'USING (SELECT 2) AS alias3, (VALUES (2, 3), (1, 3)) AS alias4 (a, b)');
        });

        $it('should parse a complex USING clause with the LATERAL keyword', async () => {
            await testParseAndStringify('UsingFromClause', 'USING (SELECT 2) AS alias3, LATERAL (VALUES (2, 3), (1, 3)) AS alias4 (a, b)');
        });

        $it('should parse ROWS USING with function list and aliases', async () => {
            await testParseAndStringify('UsingFromClause', 'USING ROWS FROM(func1(), func2()) AS funcs (a, b)', { dialect: 'postgres' });
        });

        $it('should parse ROWS FROM with WITH ORDINALITY', async () => {
            await testParseAndStringify('UsingFromClause', 'USING ROWS FROM(func1(), func2()) WITH ORDINALITY', { dialect: 'postgres' });
        });
    });

    $describe('PGReturningClause', () => {
        $it('should parse RETURNING *', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING *');
        });

        $it('should parse RETURNING single column', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING id');
        });

        $it('should parse RETURNING multiple columns', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING id, name, created_at');
        });

        $it('should parse RETURNING with expressions', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING id, name || \'_user\' AS username');
        });

        $it('should parse RETURNING with function call', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING NOW() AS created');
        });

        $it('should parse RETURNING with qualified column', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING users.id, users.name');
        });

        $it('should parse RETURNING with alias', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING id AS user_id, name AS username');
        });

        $it('should parse RETURNING with subquery', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING (SELECT MAX(id) FROM users) AS max_id');
        });

        $it('should parse RETURNING with arithmetic expressions', async () => {
            await testParseAndStringify('PGReturningClause', 'RETURNING id + 1 AS next_id');
        });
    });
});

$describe('Parser - DML Statements', () => {
    $describe('UpdateStmt', () => {
        $it('should parse UPDATE with SET using unqualified column', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET name = 'Bob'");
        });

        $it('should parse UPDATE with SET using qualified column', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET users.name = 'Bob'");
        });

        $it('should parse UPDATE with multiple column assignments', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = 1, col2 = 2");
            await testParseAndStringify('UpdateStmt', "UPDATE users SET users.col1 = 1, users.col2 = 2");
        });

        $it('should parse UPDATE with composite column assignment', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET (col1, col2) = ROW(1, 2)", { dialect: 'postgres' });
            await testParseAndStringify('UpdateStmt', "UPDATE users SET (col1, col2) = (SELECT a, b FROM t)", { dialect: 'postgres' });
        });

        $it('should parse UPDATE with expressions in SET', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = col1 + 1");
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = col2 * 2");
        });

        $it('should parse UPDATE with DEFAULT and NULL in SET', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = DEFAULT");
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = NULL");
        });

        $it('should parse UPDATE with subquery assignment', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = (SELECT MAX(val) FROM t)");
        });

        $it('should parse UPDATE with qualified table and schema', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE public.users SET name = 'Bob'");
            await testParseAndStringify('UpdateStmt', "UPDATE public.users SET public.users.name = 'Bob'");
        });

        $it('should parse UPDATE with table alias', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users u SET u.name = 'Bob'");
        });

        $it('should parse UPDATE with SET and WHERE clause', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET name = 'Bob' WHERE id = 2");
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = 2 WHERE col2 > 10");
        });

        $it('should parse UPDATE with SET and FROM clause', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = t.val FROM t WHERE t.id = 1", { dialect: 'postgres' });
            await testParseAndStringify('UpdateStmt', "UPDATE users u SET u.col1 = t.val FROM t WHERE t.id = u.id", { dialect: 'postgres' });
            await testParseAndStringify('UpdateStmt', "UPDATE users SET name = logins.last_login FROM logins WHERE users.id = logins.user_id", { dialect: 'postgres' });
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = t.val FROM t, s WHERE t.id = s.id", { dialect: 'postgres' });
        });

        $it('should parse UPDATE with JOIN in FROM clause', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = t.val FROM t INNER JOIN s ON t.id = s.id WHERE t.id = 1", { dialect: 'postgres' });
        });

        $it('should parse UPDATE with RETURNING clause', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = t.val FROM t WHERE t.id = 1 RETURNING *", { dialect: 'postgres' });
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = 2 RETURNING col1, col2 + 3, col4 alias", { dialect: 'postgres' });
        });

        $it('should parse UPDATE with ORDER BY and LIMIT (MySQL)', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET col1 = 2 ORDER BY id DESC LIMIT 5", { dialect: 'mysql' });
        });

        $it('should parse UPDATE with multiple tables (MySQL)', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users, logins SET users.active = 1, logins.last_login = NOW() WHERE users.id = logins.user_id", { dialect: 'mysql' });
        });

        $it('should parse UPDATE with WHERE CURRENT OF (Postgres)', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET name = 'Bob' WHERE CURRENT OF my_cursor", { dialect: 'postgres' });
        });

        $it('should parse UPDATE with subquery in WHERE', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE users SET active = FALSE WHERE id IN (SELECT user_id FROM logins WHERE active = FALSE)");
        });

        $it('should parse UPDATE with ONLY keyword (Postgres)', async () => {
            await testParseAndStringify('UpdateStmt', "UPDATE ONLY users SET name = 'Bob'", { dialect: 'postgres' });
        });
    });


    $describe('DeleteStmt', () => {
        $it('should parse a DELETE statement with table alias', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users u WHERE u.id = 1');
        });

        $it('should parse a DELETE statement with multiple tables with a FROM clause (MySQL)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE users, logins FROM users INNER JOIN logins ON users.id = logins.user_id WHERE users.active = 0', { dialect: 'mysql' });
        });

        $it('should parse a DELETE statement with multiple tables with a USING clause (MySQL)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users, logins USING users INNER JOIN logins ON users.id = logins.user_id WHERE users.active = 0', { dialect: 'mysql' });
        });

        $it('should parse a DELETE statement with JOIN in USING clause (Postgres)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users USING logins, sessions WHERE users.id = logins.user_id AND logins.session_id = sessions.id', { dialect: 'postgres' });
        });

        $it('should parse a DELETE statement with ONLY keyword (Postgres)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM ONLY users WHERE id = 1', { dialect: 'postgres' });
        });

        $it('should parse a DELETE statement with RETURNING clause (Postgres)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users WHERE id = 1 RETURNING id, name', { dialect: 'postgres' });
        });

        $it('should parse a DELETE statement with LIMIT (MySQL)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users WHERE active = 0 LIMIT 10', { dialect: 'mysql' });
        });

        $it('should parse a DELETE statement with ORDER BY and LIMIT (MySQL)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users WHERE active = 0 ORDER BY id DESC LIMIT 5', { dialect: 'mysql' });
        });

        $it('should parse a DELETE statement with USING and table alias (Postgres)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users u USING logins l WHERE u.id = l.user_id', { dialect: 'postgres' });
        });

        $it('should parse a DELETE statement with WHERE CURRENT OF (Postgres)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users WHERE CURRENT OF my_cursor', { dialect: 'postgres' });
        });

        $it('should parse a DELETE statement with subquery in WHERE', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users WHERE id IN (SELECT user_id FROM logins WHERE active = FALSE)');
        });

        $it('should parse a DELETE statement with USING ROWS FROM (Postgres)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users USING ROWS FROM(func1(), func2()) AS funcs (a, b) WHERE users.id = funcs.a', { dialect: 'postgres' });
        });

        $it('should parse a DELETE statement with multiple WHERE conditions', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM users WHERE active = FALSE AND created_at < \'2023-01-01\'');
        });

        $it('should parse a DELETE statement with qualified table name', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM public.users WHERE id = 1');
        });

        $it('should parse a DELETE statement with schema and alias (Postgres)', async () => {
            await testParseAndStringify('DeleteStmt', 'DELETE FROM public.users u WHERE u.id = 1', { dialect: 'postgres' });
        });
    });

    $describe('InsertStmt', () => {
        $it('should parse INSERT with multiple rows', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob')");
        });

        $it('should parse INSERT without column list', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users VALUES (1, 'Alice')");
        });

        $it('should parse INSERT with column DEFAULT keyword', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (DEFAULT, 'Alice')");
        });

        $it('should parse INSERT with VALUES and DEFAULT for all columns', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (DEFAULT, DEFAULT)");
        });

        $it('should parse INSERT with explicit NULL value', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (NULL, 'Alice')");
        });

        $it('should parse INSERT with VALUES and expressions', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1 + 2, UPPER('alice'))");
        });

        $it('should parse INSERT with VALUES and subquery in VALUES', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES ((SELECT MAX(id) FROM users), 'Alice')");
        });

        $it('should parse INSERT with DEFAULT VALUES', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users DEFAULT VALUES", { dialect: 'postgres' });
        });

        $it('should parse INSERT with SET syntax (MySQL)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users SET id = 1, name = 'Alice'", { dialect: 'mysql' });
        });

        $it('should parse INSERT with a TABLE clause (MySQL)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) TABLE accounts", { dialect: 'mysql' });
        });

        $it('should parse INSERT with table alias in SELECT', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) SELECT u.id, u.name FROM old_users u");
        });

        $it('should parse INSERT with subquery and ORDER BY', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) SELECT id, name FROM old_users ORDER BY id DESC");
        });

        $it('should parse INSERT with SELECT and LIMIT', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) SELECT id, name FROM old_users LIMIT 10");
        });

        $it('should parse INSERT with ON DUPLICATE KEY UPDATE (MySQL)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1, 'Alice') ON DUPLICATE KEY UPDATE name = 'Bob'", { dialect: 'mysql' });
        });

        $it('should parse INSERT with ON CONFLICT DO NOTHING (Postgres)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1, 'Alice') ON CONFLICT DO NOTHING", { dialect: 'postgres' });
        });

        $it('should parse INSERT with ON CONFLICT DO UPDATE (Postgres)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1, 'Alice') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name", { dialect: 'postgres' });
        });

        $it('should parse INSERT with ON CONFLICT and WHERE clause (Postgres)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1, 'Alice') ON CONFLICT (id) WHERE id > 0 DO UPDATE SET name = EXCLUDED.name", { dialect: 'postgres' });
        });

        $it('should parse INSERT with ON CONFLICT DO UPDATE and WHERE clause (Postgres)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1, 'Alice') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name WHERE users.active = TRUE", { dialect: 'postgres' });
        });

        $it('should parse INSERT with RETURNING clause (Postgres)', async () => {
            await testParseAndStringify('InsertStmt', "INSERT INTO users (id, name) VALUES (1, 'Alice') RETURNING id, name", { dialect: 'postgres' });
        });
    });

    $describe('UpsertStmt', () => {
        $it('should parse simple UPSERT with column list and values', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) VALUES (1, 'Alice')");
        });

        $it('should parse UPSERT without column list', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users VALUES (1, 'Alice')");
        });

        $it('should parse UPSERT with multiple rows', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob')");
        });

        $it('should parse UPSERT with DEFAULT keyword', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) VALUES (DEFAULT, 'Alice')");
        });

        $it('should parse UPSERT with NULL value', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) VALUES (NULL, 'Alice')");
        });

        $it('should parse UPSERT with expressions in values', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) VALUES (1 + 2, UPPER('alice'))");
        });

        $it('should parse UPSERT with subquery in values', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) VALUES ((SELECT MAX(id) FROM users), 'Alice')");
        });

        $it('should parse UPSERT with DEFAULT VALUES (Postgres)', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users DEFAULT VALUES", { dialect: 'postgres' });
        });

        $it('should parse UPSERT with SELECT statement', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) SELECT id, name FROM old_users");
        });

        $it('should parse UPSERT with SELECT and ORDER BY', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) SELECT id, name FROM old_users ORDER BY id DESC");
        });

        $it('should parse UPSERT with SELECT and LIMIT', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) SELECT id, name FROM old_users LIMIT 10");
        });

        $it('should parse UPSERT with RETURNING clause (Postgres)', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) VALUES (1, 'Alice') RETURNING id, name", { dialect: 'postgres' });
        });

        $it('should parse UPSERT with table alias in SELECT', async () => {
            await testParseAndStringify('UpsertStmt', "UPSERT INTO users (id, name) SELECT u.id, u.name FROM old_users u");
        });
    });

    $describe('MYSetStmt', () => {
        $it('should parse SET with user variable', async () => {
            await testParseAndStringify('MYSetStmt', 'SET @var1 = 5', { dialect: 'mysql' });
        });

        $it('should parse SET with system variable', async () => {
            await testParseAndStringify('MYSetStmt', 'SET @@autocommit = 0', { dialect: 'mysql' });
        });

        $it('should parse SET with multiple variables', async () => {
            await testParseAndStringify('MYSetStmt', 'SET @a = 1, @b = 2', { dialect: 'mysql' });
        });

        $it('should parse SET with multiple variables, mixing operator', async () => {
            await testParseAndStringify('MYSetStmt', 'SET @a := 1, @b = 2', { dialect: 'mysql' });
        });
    });
});
