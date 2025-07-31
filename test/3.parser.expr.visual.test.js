import { expect } from 'chai';
import { $describe, $it, testParseAndStringify, testExprAndNodeEntryPoints } from './0.parser.js';
import { registry } from '../src/lang/registry.js';

$describe('Parser - Function Calls (CallExpr)', () => {
    $it('should parse a function call with no arguments', async () => {
        await testExprAndNodeEntryPoints('CallExpr', 'NOW()');
    });

    $it('should parse a function call with a single argument', async () => {
        await testExprAndNodeEntryPoints('CallExpr', 'LENGTH(\'hello\')');
    });

    $it('should parse a function call with multiple arguments', async () => {
        await testExprAndNodeEntryPoints('CallExpr', 'CONCAT(\'a\', \'b\', \'c\')');
    });

    $it('should parse a function call with complex arguments (e.g., nested expressions)', async () => {
        await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(col1 + col2)');
        await testExprAndNodeEntryPoints('CallExpr', 'GREATEST(col1, LEAST(col2, col3))');
    });

    $it('should parse a function call with DISTINCT argument', async () => {
        await testExprAndNodeEntryPoints('AggrCallExpr', 'COUNT(DISTINCT user_id)');
    });

    $it('should throw an error for a function call with too many arguments (arity enforcement)', async () => {
        expect(registry.CallExpr.parse('NOW(1)', { assert: true })).to.be.rejected;
    });

    $it('should throw an error for a function call with too few arguments (arity enforcement)', async () => {
        expect(registry.CallExpr.parse('IF(condition)', { assert: true })).to.be.rejected;
    });

    $it('should parse GROUPING function', async () => {
        await testParseAndStringify('CallExpr', `GROUPING(col1)`, { dialect: 'postgres' });
    });

    $it('should parse GROUPING function with multiple arguments', async () => {
        await testParseAndStringify('CallExpr', `GROUPING(col1, col2)`, { dialect: 'postgres' });
    });
});

$describe('Parser - Aggregate/Window Functions (AggrCallExpr)', () => {
    $it('should parse a simple aggregate function (e.g., COUNT(*))', async () => {
        await testExprAndNodeEntryPoints('AggrCallExpr', 'COUNT(*)');
    });

    $it('should parse an aggregate function with DISTINCT', async () => {
        await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(DISTINCT price)');
    });

    $it('should parse an aggregate function with FILTER clause', async () => {
        await testExprAndNodeEntryPoints('AggrCallExpr', 'COUNT(*) FILTER (WHERE status = \'active\')');
    });

    $it('should parse an aggregate function with ORDER BY clause', async () => {
        await testExprAndNodeEntryPoints('AggrCallExpr', 'STRING_AGG(col1, \',\' ORDER BY col2)');
    });

    $it('should parse an aggregate function with SEPARATOR clause (if applicable)', async () => {
        await testExprAndNodeEntryPoints('AggrCallExpr', 'GROUP_CONCAT(name SEPARATOR \';\')', { dialect: 'mysql' });
    });

    $describe('Window Function OVER() Clause', () => {
        $it('should parse a window function with empty OVER()', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'ROW_NUMBER() OVER ()');
        });

        $it('should parse OVER() with PARTITION BY', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(sales) OVER (PARTITION BY region)');
        });

        $it('should parse OVER() with ORDER BY', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'RANK() OVER (ORDER BY salary DESC)');
        });

        $it('should parse OVER() with PARTITION BY and ORDER BY', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'AVG(score) OVER (PARTITION BY class ORDER BY exam_date)');
        });

        $it('should parse OVER() referencing a named window', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(sales) OVER my_window');
        });

        $it('should parse OVER() with inheritance and additional clauses', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(sales) OVER (my_base_window ORDER BY sale_date DESC)');
        });

        $it('should parse window function with IGNORE NULLS', async () => {
            await testParseAndStringify('AggrCallExpr', `LAG(col1, 2) IGNORE NULLS OVER (ORDER BY col2)`, { dialect: 'postgres' });
        });

        $it('should parse window function with RESPECT NULLS', async () => {
            await testParseAndStringify('AggrCallExpr', `LEAD(col1, 1) RESPECT NULLS OVER (PARTITION BY col2 ORDER BY col3)`, { dialect: 'postgres' });
        });
    });

    $describe('Window Frame Specifiers', () => {
        $it('should parse ROWS UNBOUNDED PRECEDING', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(val) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING)');
        });

        $it('should parse ROWS numeric_value PRECEDING', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'AVG(val) OVER (ORDER BY id ROWS 5 PRECEDING)');
        });

        $it('should parse ROWS CURRENT ROW', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'MAX(val) OVER (ORDER BY id ROWS CURRENT ROW)');
        });

        $it('should parse ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(val) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)');
        });

        $it('should parse ROWS BETWEEN numeric_value PRECEDING AND CURRENT ROW', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'AVG(val) OVER (ORDER BY id ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)');
        });

        $it('should parse ROWS BETWEEN CURRENT ROW AND numeric_value FOLLOWING', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'COUNT(*) OVER (ORDER BY id ROWS BETWEEN CURRENT ROW AND 2 FOLLOWING)');
        });

        $it('should parse RANGE UNBOUNDED PRECEDING', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(val) OVER (ORDER BY date_col RANGE UNBOUNDED PRECEDING)');
        });

        $it('should parse RANGE numeric_value PRECEDING (for numeric order by)', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'AVG(val) OVER (ORDER BY num_col RANGE 10 PRECEDING)');
        });

        $it('should parse RANGE INTERVAL PRECEDING (for date/time order by)', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(val) OVER (ORDER BY ts_col RANGE INTERVAL \'1 day\' PRECEDING)');
        });

        $it('should parse GROUPS BETWEEN numeric_value PRECEDING AND numeric_value FOLLOWING', async () => {
            await testExprAndNodeEntryPoints('AggrCallExpr', 'SUM(val) OVER (ORDER BY group_id GROUPS BETWEEN 1 PRECEDING AND 1 FOLLOWING)');
        });
    });
});

$describe('Parser - Binary Expressions (BinaryExpr)', () => {
    $it('should parse basic arithmetic expressions with correct precedence (* / + -)', async () => {
        await testParseAndStringify(['Expr', 'BinaryExpr'], '1 + 2 * 3'); // Should be 1 + (2 * 3)
        await testParseAndStringify(['Expr', 'BinaryExpr'], '(1 + 2) * 3'); // Explicit parentheses
        await testParseAndStringify(['Expr', 'BinaryExpr'], '10 / 2 - 1');
    });

    $it('should parse comparison expressions', async () => {
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'col1 = col2');
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'price > 100');
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'quantity <= 50');
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'col <> \'test\'');
    });

    $it('should parse logical expressions (AND, OR, NOT) with correct precedence', async () => {
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'a AND b OR c'); // (a AND b) OR c
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'a OR b AND c'); // a OR (b AND c)
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'NOT a AND b'); // (NOT a) AND b
    });

    $it('should parse bitwise operators', async () => {
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'a & b');
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'x << 2');
    });

    $it('should parse concatenation operator (||)', async () => {
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'str1 || str2');
    });

    $it('should correctly handle complex expressions with mixed operator types and precedence', async () => {
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'a * b + c / d = e AND f > g OR h');
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'col1 BETWEEN 10 AND 20');
        await testParseAndStringify(['Expr', 'BinaryExpr'], 'col1 BETWEEN 10 AND 20 AND col2 IS NOT NULL');
    });
});

$describe('Parser - Unary Expressions (UnaryExpr)', () => {
    $it('should parse NOT boolean_expression', async () => {
        await testExprAndNodeEntryPoints('UnaryExpr', 'NOT is_active');
        await testExprAndNodeEntryPoints('UnaryExpr', 'NOT (a AND b)');
    });

    $it('should parse unary plus and minus', async () => {
        await testExprAndNodeEntryPoints('UnaryExpr', '+5');
        await testExprAndNodeEntryPoints('UnaryExpr', '-col_value');
    });
});

$describe('Parser - CASE Expression', () => {
    $it('should parse a simple CaseExpr with a subject and single WHEN clause', async () => {
        await testExprAndNodeEntryPoints('CaseExpr', 'CASE subj1 WHEN eww THEN 44 END');
    });

    $it('should parse a CaseExpr where the subject is a CastExpr', async () => {
        await testExprAndNodeEntryPoints('CaseExpr', 'CASE 66::INT WHEN eww THEN 44 END');
    });

    $it('should parse a complex nested CaseExpr with CastExpr and multiple WHEN/ELSE clauses, and pretty-print properly', async () => {
        const sql =
            `CASE CAST(66 AS INT)
  WHEN eww THEN 44
  WHEN eww2 THEN 442
  WHEN eww3 THEN 443
ELSE
  CASE CAST(66 AS INT)
    WHEN eww THEN 44
    WHEN eww2 THEN 442
    WHEN eww3 THEN 443
  ELSE
    67
  END
END`;
        await testExprAndNodeEntryPoints('CaseExpr', sql, { prettyPrint: true, autoLineBreakThreshold: 5 });
    });
});

$describe('Parser - Specialized Operator Expressions', () => {
    $describe('CastExpr', () => {
        $it('should parse CAST(expr AS type)', async () => {
            await testExprAndNodeEntryPoints('CastExpr', 'CAST(col AS INT)');
            await testExprAndNodeEntryPoints('CastExpr', 'CAST(\'123\' AS NUMERIC(5, 2))');
        });

        $it('should parse expr::type (PostgreSQL)', async () => {
            await testParseAndStringify(['Expr', 'PGCastExpr2'], 'col::TEXT', { dialect: 'postgres' });
            await testParseAndStringify(['Expr', 'PGCastExpr2'], '123::BIGINT', { dialect: 'postgres' });
        });
    });

    $describe('BetweenExpr', () => {
        $it('should parse expr BETWEEN lower AND upper', async () => {
            await testParseAndStringify(['Expr', 'BetweenExpr'], 'age BETWEEN 18 AND 65');
        });

        $it('should parse expr NOT BETWEEN lower AND upper', async () => {
            await testParseAndStringify(['Expr', 'BetweenExpr'], 'value NOT BETWEEN 0 AND 100');
        });

        $it('should handle complex expressions as bounds', async () => {
            await testParseAndStringify(['Expr', 'BetweenExpr'], 'my_date BETWEEN CURRENT_DATE - INTERVAL \'1 month\' AND CURRENT_DATE', { pruneOptionalParens: true });
        });
    });

    $describe('DistinctFromExpr', () => {
        $it('should parse expr1 IS DISTINCT FROM expr2', async () => {
            await testParseAndStringify(['Expr', 'DistinctFromExpr'], 'age IS DISTINCT FROM 65');
        });

        $it('should parse expr1 IS NOT DISTINCT FROM expr2', async () => {
            await testParseAndStringify(['Expr', 'DistinctFromExpr'], 'age IS NOT DISTINCT FROM 65');
        });
    });

    $describe('LinkedQL Deep Refs', () => {
        $it('should parse a basic LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', 'fk ~> col1');
        });

        $it('should parse a deep deep LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', 'fk ~> col1 ~> col2');
        });

        $it('should parse a basic LQBackRef', async () => {
            await testExprAndNodeEntryPoints('LQBackRef', 'col1 <~ tbl');
        });

        $it('should parse a back back LQBackRef', async () => {
            await testParseAndStringify(['Expr', 'LQBackRef'], 'col0 <~ col1 <~ tbl');
        });

        $it('should parse a back back LQBackRefConstructor', async () => {
            await testExprAndNodeEntryPoints('LQBackRefConstructor', '(col0 <~ col1 <~ tbl)');
        });

        $it('should parse a basic back-referencing LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', '(col1 <~ tbl) ~> col2');
        });

        $it('should parse a back, back-referencing LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', '(col2 <~ col1 <~ tbl) ~> col2');
        });

        $it('should parse a deep, deep-shaped LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', 'tbl ~> col2 ~> { a, b }');
        });

        $it('should parse a back-referencing, deep, deep-shaped LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', '(col1 <~ tbl) ~> col2 ~> { a, b }');
        });

        $it('should parse a back, back-referencing, deep, deep-shaped LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', '(col1 <~ tbl) ~> col2 ~> { a, b }');
        });

        $it('should parse a back-referencing LQBackRefConstructor as column qualifier', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', '(col <~ tbl).col');
        });

        $it('should parse a back, back-referencing LQBackRefConstructor as column qualifier', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', '(fk2 <~ fk1 <~ tbl).col');
        });

        $it('should parse a back, back-referencing LQBackRefConstructor as left of LQDeepRef', async () => {
            await testExprAndNodeEntryPoints('LQDeepRef', '(fk2 <~ fk1 <~ tbl).fk ~> col');
        });
    });
});

$describe('Parser - References and Identifiers', () => {
    $describe('Unqualified References', () => {
        $it('should parse a simple column reference (ColumnRef)', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', 'my_column');
        });

        $it('should parse a star reference "*"', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', '*');
        });

        $it('should parse a table reference (TableRef)', async () => {
            await testParseAndStringify('TableRef', 'my_table');
        });

        $it('should parse a table reference with version spec (TableRef)', async () => {
            await testParseAndStringify('TableRef', 'my_table@2_1');
            await testParseAndStringify('TableRef', 'my_table @2_1', { stripSpaces: true });
            await testParseAndStringify('TableRef', 'my_table @\'2_1\'', { stripSpaces: true, stripQuotes: true });
        });

        $it('should parse a database reference (SchemaRef)', async () => {
            await testParseAndStringify('SchemaRef', 'my_database');
        });

        $it('should parse a database reference with version spec (SchemaRef)', async () => {
            await testParseAndStringify('SchemaRef', 'my_database@2_1');
            await testParseAndStringify('SchemaRef', 'my_database @2_1', { stripSpaces: true });
            await testParseAndStringify('SchemaRef', 'my_database @\'2_1\'', { stripSpaces: true, stripQuotes: true });
        });
    });

    $describe('Qualified References', () => {

        // --------- 2-level qualified references ---------

        $it('should parse table.column (ColumnRef)', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', 'users.id');
        });

        $it('should parse qualified star reference (table.*)', async () => {
            await testParseAndStringify('ColumnRef', 'users.*');
        });

        $it('should parse schema.table (TableAbstractionRef)', async () => {
            await testParseAndStringify('TableRef', 'public.users');
        });

        $it('should parse schema.table@... (TableRef)', async () => {
            await testParseAndStringify('TableRef', 'public.users@^4');
            await testParseAndStringify('TableRef', 'public.users@~7_6');
            await testParseAndStringify('TableRef', 'public.users@=3_4');
            await testParseAndStringify('TableRef', 'public.users@<3');
            await testParseAndStringify('TableRef', 'public . "users" @>4', { stripSpaces: true });
            await testParseAndStringify('TableRef', 'public."us ers"@<=3');
            await testParseAndStringify('TableRef', 'public.`us ers`@>=4', { dialect: 'mysql' });
        });

        // --------- 3-level qualified references ---------

        $it('should parse schema.table.column (ColumnRef)', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', 'public.users.id');
        });

        $it('should parse schema.table.column (ColumnRef)', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', 'public.users.id');
        });

        $it('should parse schema@....table.column (ColumnRef)', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', 'public@^4.users.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@~7_6.users.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@=3_4.users.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@<3.users.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public @>4 . "users" . id', { stripSpaces: true });
            await testExprAndNodeEntryPoints('ColumnRef', 'public@<=3."us ers".id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@>=4.`us ers`.id', { dialect: 'mysql' });
        });

        $it('should parse schema@....table@....column (ColumnRef)', async () => {
            await testExprAndNodeEntryPoints('ColumnRef', 'public@^4.users@^4.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@~7_6.users@~7_6.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@=3_4.users@=3_4.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@<3.users@<3.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public @>4 . "users" @>4 . id', { stripSpaces: true });
            await testExprAndNodeEntryPoints('ColumnRef', 'public@<=3."us ers"@<=3.id');
            await testExprAndNodeEntryPoints('ColumnRef', 'public@>=4.`us ers`@>=4.id', { dialect: 'mysql' });
        });
    });
});

$describe('Parser - Literals', () => {
    $describe('LinkedQL Literals', () => {
        $it('should parse an LQArrayLiteral', async () => {
            await testExprAndNodeEntryPoints('LQArrayLiteral', '[1, \'text\', TRUE]');
        });

        $it('should parse an LQObjectLiteral with key-value pairs', async () => {
            await testExprAndNodeEntryPoints('LQObjectLiteral', '{ key1: 1, key2: \'value\' }');
        });

        $it('should parse an LQObjectLiteral with shorthand keys', async () => {
            await testExprAndNodeEntryPoints('LQObjectLiteral', '{ key1, key2: \'value\' }');
        });

        $it('should handle nested LQArray and LQObject literals', async () => {
            await testExprAndNodeEntryPoints('LQObjectLiteral', '{ id: 1, data: [{ item: \'a\' }, { item: \'b\' }] }');
        });
    });

    $describe('Parenthesized and Row Constructors', () => {
        $it('should parse a ParenShape (parenthesized expression)', async () => {
            await testParseAndStringify('ParenShape', '(col1 + col2)');
        });

        $it('should parse a SetConstructor (row constructor)', async () => {
            await testExprAndNodeEntryPoints('SetConstructor', '(1, \'text\', TRUE)');
        });
    });

    $describe('PostgreSQL Array Literals (PGArrayLiteral)', () => {
        $it('should parse ARRAY[value1, value2, ...]', async () => {
            await testExprAndNodeEntryPoints('PGArrayLiteral', 'ARRAY[1, 2, 3]');
        });

        $it('should parse \'{value1, value2, ...}\'::type[]', async () => {
            await testParseAndStringify(['Expr', 'PGCastExpr2'], '\'{a,b,c}\'::TEXT[]');
        });
    });

    $describe('Typed Literals', () => {
        $it('should parse TypedDateLiteral', async () => {
            await testExprAndNodeEntryPoints('TypedDateLiteral', 'DATE \'2023-01-15\'');
        });

        $it('should parse TypedTimeLiteral WITHOUT TIME ZONE (PostgreSQL)', async () => {
            await testExprAndNodeEntryPoints('TypedTimeLiteral', 'TIME \'14:30:00\' WITHOUT TIME ZONE', { dialect: 'postgres' });
        });

        $it('should parse TypedTimeLiteral WITH TIME ZONE (PostgreSQL)', async () => {
            await testExprAndNodeEntryPoints('TypedTimeLiteral', 'TIME \'14:30:00+01\' WITH TIME ZONE', { dialect: 'postgres' });
        });

        $it('should parse TypedTimestampLiteral WITHOUT TIME ZONE (PostgreSQL)', async () => {
            await testExprAndNodeEntryPoints('TypedTimestampLiteral', 'TIMESTAMP \'2023-01-15 14:30:00\' WITHOUT TIME ZONE', { dialect: 'postgres' });
        });

        $it('should parse TypedTimestampLiteral WITH TIME ZONE (PostgreSQL)', async () => {
            await testExprAndNodeEntryPoints('TypedTimestampLiteral', 'TIMESTAMP \'2023-01-15 14:30:00 PST\' WITH TIME ZONE', { dialect: 'postgres' });
        });

        $it('should parse TypedIntervalLiteral with single unit', async () => {
            await testExprAndNodeEntryPoints('TypedIntervalLiteral', 'INTERVAL \'1 day\'');
        });

        $it('should parse TypedIntervalLiteral with multiple units', async () => {
            await testExprAndNodeEntryPoints('TypedIntervalLiteral', 'INTERVAL \'1 year 2 months 3 days\'');
        });

        $it('should parse TypedIntervalLiteral with ISO 8601 format', async () => {
            await testExprAndNodeEntryPoints('TypedIntervalLiteral', 'INTERVAL \'P1Y2M3DT4H5M6S\'');
        });

        $it('should parse generic TypedLiteral (e.g., BOOLEAN, UUID)', async () => {
            await testExprAndNodeEntryPoints('TypedLiteral', 'BOOLEAN \'false\'');
            await testExprAndNodeEntryPoints('TypedLiteral', 'UUID \'a1b2c3d4-e5f6-7890-1234-567890abcdef\'');
        });
    });

        $describe('AT TIME ZONE / AT LOCAL', () => {
            $it('should parse an expression with AT TIME ZONE using a string literal timezone', async () => {
                await testParseAndStringify(['Expr', 'AtTimeZoneExpr'], `'2023-10-27 10:00:00'::TIMESTAMP AT TIME ZONE 'America/New_York'`, { dialect: 'postgres' });
            });

            $it('should parse an expression with AT TIME ZONE using an identifier timezone', async () => {
                await testParseAndStringify(['Expr', 'AtTimeZoneExpr'], `my_timestamp_col AT TIME ZONE 'PST'`, { dialect: 'postgres' });
            });

            $it('should parse an expression with AT LOCAL', async () => {
                await testParseAndStringify(['Expr', 'AtTimeZoneExpr'], `'2023-10-27 10:00:00'::TIMESTAMP AT LOCAL`, { dialect: 'postgres' });
            });

            $it('should parse AT TIME ZONE applied to a TIMESTAMPTZ', async () => {
                await testParseAndStringify(['Expr', 'AtTimeZoneExpr'], `'2023-10-27 10:00:00 EST'::TIMESTAMPTZ AT TIME ZONE 'GMT'`, { dialect: 'postgres' });
            });

            $it('should parse AT LOCAL applied to a TIMESTAMPTZ', async () => {
                await testParseAndStringify(['Expr', 'AtTimeZoneExpr'], `'2023-10-27 10:00:00+05'::TIMESTAMPTZ AT LOCAL`, { dialect: 'postgres' });
            });

            $it('should parse AT TIME ZONE with a subquery as timezone expression', async () => {
                await testParseAndStringify(['Expr', 'AtTimeZoneExpr'], `'2023-01-01 12:00:00' AT TIME ZONE (SELECT current_setting('TimeZone'))`, { dialect: 'postgres' });
            });
        });
});
