import { $describe, $it, testParseAndStringify } from './00.parser.js';
import { SchemaInference } from '../src/lang/SchemaInference.js';

let schemaInference;
$describe('DeSugaring Setup', () => {
    $it('should establish the schemaInference object with test catalog', async () => {
        const { catalog } = await import('./01.catalog.parser.js');
        schemaInference = new SchemaInference({ catalog });
    });
});

$describe('DeSugaring - Expr DeSugaring', () => {
    $describe('LQObjectLiteral', () => {
        $it('should parse an "LQObjectLiteral" expr with formal fields and desugar it - Postgres', async () => {
            const inputSql = `{ key1: 'value1', key2: 'value2' }`;
            const outputSql = `JSON_BUILD_OBJECT('key1', 'value1', 'key2', 'value2')`;
            await testParseAndStringify('LQObjectLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'postgres' });
        });

        $it('should parse an "LQObjectLiteral" expr with formal fields and desugar it - MySQL', async () => {
            const inputSql = `{ key1: 'value1', key2: 'value2' }`;
            const outputSql = `JSON_OBJECT('key1', 'value1', 'key2', 'value2')`;
            await testParseAndStringify('LQObjectLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'mysql' });
        });

        $it('should parse an "LQObjectLiteral" expr with shorthand fields and desugar it - Postgres', async () => {
            const inputSql = `{ key1, key2: 'value2' }`;
            const outputSql = `JSON_BUILD_OBJECT('key1', key1, 'key2', 'value2')`;
            await testParseAndStringify('LQObjectLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'postgres' });
        });

        $it('should parse an "LQObjectLiteral" expr with shorthand fields and desugar it - MySQL', async () => {
            const inputSql = `{ key1, key2: 'value2' }`;
            const outputSql = `JSON_OBJECT('key1', key1, 'key2', 'value2')`;
            await testParseAndStringify('LQObjectLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'mysql' });
        });

        $it('should parse an "LQObjectLiteral" expr with aggregation syntax and desugar it - Postgres', async () => {
            const inputSql = `{ key1, key2[]: expr }`;
            const outputSql = `JSON_BUILD_OBJECT('key1', key1, 'key2', JSON_AGG(expr))`;
            await testParseAndStringify('LQObjectLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'postgres' });
        });

        $it('should parse an "LQObjectLiteral" expr with aggregation syntax and desugar it - MySQL', async () => {
            const inputSql = `{ key1, key2[]: expr }`;
            const outputSql = `JSON_OBJECT('key1', key1, 'key2', JSON_ARRAYAGG(expr))`;
            await testParseAndStringify('LQObjectLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'mysql' });
        });
    });

    $describe('LQArrayLiteral', () => {
        $it('should parse an "LQArrayLiteral" expr and desugar it - Postgres', async () => {
            const inputSql = `['value1', 'value2']`;
            const outputSql = `JSON_BUILD_ARRAY('value1', 'value2')`;
            await testParseAndStringify('LQArrayLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'postgres' });
        });

        $it('should parse an "LQArrayLiteral" expr and desugar it - MySQL', async () => {
            const inputSql = `['value1', 'value2']`;
            const outputSql = `JSON_ARRAY('value1', 'value2')`;
            await testParseAndStringify('LQArrayLiteral', [inputSql, outputSql], { deSugar: true, dialect: 'mysql' });
        });
    });

    $describe('PGTypedArrayLiteral', () => {
        $it('should parse an "PGTypedArrayLiteral" expr toDialect: mysql', async () => {
            const inputSql = `ARRAY['value1', 'value2']`;
            const outputSql = `JSON_ARRAY('value1', 'value2')`;
            await testParseAndStringify('PGTypedArrayLiteral', [inputSql, outputSql], { toDialect: 'mysql' });
        });
    });

    $describe('SelectElement', () => {

        $it('should parse an "SelectElement" expr with an aggregation syntax - Postgres', async () => {
            const inputSql = `SELECT email AS alias[] FROM users`;
            const outputSql = `SELECT JSON_AGG(users.email) AS alias FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, dialect: 'postgres' }, schemaInference);
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - MySQL', async () => {
            const inputSql = `SELECT email AS alias[] FROM users`;
            const outputSql = `SELECT JSON_ARRAYAGG(users.email) AS alias FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, dialect: 'mysql' }, schemaInference);
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - Postgres', async () => {
            const inputSql = `SELECT email + 1 - 3 alias[] FROM users`;
            const outputSql = `SELECT JSON_AGG(users.email + 1 - 3) alias FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, dialect: 'postgres' }, schemaInference);
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - MySQL', async () => {
            const inputSql = `SELECT email + 1 - 3 alias[] FROM public.users`;
            const outputSql = `SELECT JSON_ARRAYAGG(users.email + 1 - 3) alias FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, dialect: 'mysql' }, schemaInference);
        });
    });

    $describe('VersionSpec', () => {
        $it('should parse an "NamespaceRef" with version spec to just the NamespaceRef - Postgres', async () => {
            const inputSql = `schema1@3_3`;
            const outputSql = `schema1`;
            await testParseAndStringify('NamespaceRef', [inputSql, outputSql], { deSugar: true });
        });

        $it('should parse an "TableRef1" with version spec to just the TableRef1 - Postgres', async () => {
            const inputSql = `tbl@3_3`;
            const outputSql = `tbl`;
            await testParseAndStringify('TableRef1', [inputSql, outputSql], { deSugar: true });
        });
    });

    $describe('LQObjectLiteral As Root Select List', () => {
        $it('should parse an "SelectStmt" with un-aliased LQObjectLiteral as root select list - Postgres', async () => {
            const inputSql = `SELECT { id, username, emails[]: email + 4 } FROM users`;
            const outputSql = `SELECT JSON_BUILD_OBJECT('id', users.id, 'username', users.username, 'emails', JSON_AGG(users.email + 4)) FROM public.users`;
            await testParseAndStringify('SelectStmt', [inputSql, outputSql], { deSugar: true, dialect: 'postgres' }, schemaInference);
        });

        $it('should parse an "SelectStmt" with un-aliased LQObjectLiteral as root select list - MySQL', async () => {
            const inputSql = `SELECT { id, username, emails[]: email + 4 } FROM users`;
            const outputSql = `SELECT JSON_OBJECT('id', users.id, 'username', users.username, 'emails', JSON_ARRAYAGG(users.email + 4)) FROM public.users`;
            await testParseAndStringify('SelectStmt', [inputSql, outputSql], { deSugar: true, dialect: 'mysql' }, schemaInference);
        });
    });
});

$describe('DeSugaring - Refs Resolution', () => {

    $describe('TableRef1', () => {
        $it('should parse a bare "TableRef1" to a fully-qualified TableRef1', async () => {
            const inputSql = `users`;
            const outputSql = `public.users`;
            await testParseAndStringify('TableRef1', [inputSql, outputSql], { deSugar: true }, schemaInference);
        });
    });

    $describe('ColumnRef1', () => {
        $it('should parse and fully-qualify a bare "ColumnRef1"', async () => {
            const inputSql = `SELECT username FROM users`;
            const outputSql = `SELECT users.username FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, schemaInference);
        });

        $it('should parse and fully-qualify a bare "ColumnRef1"', async () => {
            const inputSql = `SELECT id FROM orders AS o`;
            const outputSql = `SELECT o.id FROM public.orders AS o`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, schemaInference);
        });

        $it('should parse and deSugar/expand a "star" ref', async () => {
            const inputSql =
                `SELECT *
FROM users`;
            const outputSql =
                `SELECT
  users.id AS id,
  users.parent_user1 AS parent_user1,
  users.parent_user2 AS parent_user2,
  users.metadata AS metadata,
  users.username AS username,
  users.email AS email,
  users.password_hash AS password_hash,
  users.created_at AS created_at,
  users.updated_at AS updated_at,
  users.status AS status
FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });
});

$describe('DeSugaring - Multi-dimensional SELECT Statements', () => {

    $describe('Deep Refs', () => {
        $it('should parse and deSugar a basic Deep Ref', async () => {
            const inputSql =
                `SELECT id, user ~> email 
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS email FROM public.orders AS o LEFT JOIN (SELECT users.id AS "$key~0", users.email AS "$ref~0" FROM public.users) AS "$join~0" ON o.user = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a multi-level Deep Ref', async () => {
            const inputSql =
                `SELECT id, parent_order ~> parent_order ~> status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status FROM public.orders AS o LEFT JOIN (SELECT orders.id AS "$key~0", "$join~0"."$ref~0" AS "$ref~0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.status AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0") AS "$join~0" ON o.parent_order = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar into a single JOIN multiple Deep Refs', async () => {
            const inputSql =
                `SELECT
  id,
  parent_order ~> parent_order ~> status,
  parent_order ~> parent_order
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status, "$join~0"."$ref~1" AS parent_order FROM public.orders AS o LEFT JOIN (SELECT orders.id AS "$key~0", "$join~0"."$ref~0" AS "$ref~0", orders.parent_order AS "$ref~1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.status AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0") AS "$join~0" ON o.parent_order = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a subquery-level Deep Ref', async () => {
            const inputSql =
                `SELECT 
  id,
  u.parent_user1 ~> email AS outerParentEmail,
  innerParentEmail
FROM orders AS o
CROSS JOIN (
  SELECT parent_user1, parent_user1 ~> email AS innerParentEmail
  FROM users
) AS u`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS outerparentemail, u.innerparentemail AS innerparentemail FROM public.orders AS o CROSS JOIN (SELECT users.parent_user1 AS parent_user1, "$join~0"."$ref~0" AS innerparentemail FROM public.users LEFT JOIN (SELECT users.id AS "$key~0", users.email AS "$ref~0" FROM public.users) AS "$join~0" ON users.parent_user1 = "$join~0"."$key~0") AS u LEFT JOIN (SELECT users.id AS "$key~0", users.email AS "$ref~0" FROM public.users) AS "$join~0" ON u.parent_user1 = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should "expose" a foreign key from subquery to outer query and plot a Deep Ref from off it', async () => {
            const inputSql =
                `SELECT id, u.parent ~> email AS outerParentEmail, "innerParentEmail"
FROM orders AS o
CROSS JOIN (
  SELECT
    parent_user1 AS parent,
    parent_user1 ~> email AS "innerParentEmail"
  FROM users
) AS u`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS outerparentemail, u."innerParentEmail" AS "innerParentEmail" FROM public.orders AS o CROSS JOIN (SELECT users.parent_user1 AS parent, "$join~0"."$ref~0" AS "innerParentEmail" FROM public.users LEFT JOIN (SELECT users.id AS "$key~0", users.email AS "$ref~0" FROM public.users) AS "$join~0" ON users.parent_user1 = "$join~0"."$key~0") AS u LEFT JOIN (SELECT users.id AS "$key~0", users.email AS "$ref~0" FROM public.users) AS "$join~0" ON u.parent = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should "inherit" a foreign key from outer query at subquery and plot a Deep Ref from off it', async () => {
            const inputSql =
                `SELECT
  id,
  parent_user1 ~> email AS outerParentEmail,
  parent_order,
  innerParentEmail
FROM users AS u
CROSS JOIN LATERAL (
  SELECT parent_order, parent_user1 ~> id AS innerParentEmail
  FROM orders
) AS o`;
            const outputSql = `SELECT u.id AS id, "$join~0"."$ref~0" AS outerparentemail, o.parent_order AS parent_order, o.innerparentemail AS innerparentemail FROM public.users AS u CROSS JOIN LATERAL (SELECT orders.parent_order AS parent_order, "$join~0"."$ref~0" AS innerparentemail FROM public.orders LEFT JOIN (SELECT users.id AS "$key~0", users.id AS "$ref~0" FROM public.users) AS "$join~0" ON u.parent_user1 = "$join~0"."$key~0") AS o LEFT JOIN (SELECT users.id AS "$key~0", users.email AS "$ref~0" FROM public.users) AS "$join~0" ON u.parent_user1 = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('Back Referencing Deep Refs', () => {
        $it('should parse and deSugar a basic "back-referencing" Deep Ref', async () => {
            const inputSql =
                `SELECT id, (parent_order <~ orders) ~> status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status FROM public.orders AS o LEFT JOIN (SELECT orders.parent_order AS "$key~0", orders.status AS "$ref~0" FROM public.orders) AS "$join~0" ON o.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a basic "back-referencing" Deep Ref as an aggregated output field', async () => {
            const inputSql =
                `SELECT id, (parent_order <~ orders) ~> status AS status[]
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status FROM public.orders AS o LEFT JOIN (SELECT orders.parent_order AS "$key~0", JSON_AGG(orders.status) AS "$ref~0" FROM public.orders GROUP BY "$key~0") AS "$join~0" ON o.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a "back-referencing" Deep Ref with an explicit base "From Item" specifier', async () => {
            const inputSql =
                `SELECT
  email,
  ((u) parent_user1 <~ parent_user1 <~ users).metadata ~> id AS m[]
FROM users u`;
            const outputSql = `SELECT u.email AS email, "$join~0"."$ref~0" AS m FROM public.users u LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", JSON_AGG("$join~1"."$ref~1") AS "$ref~0" FROM public.users LEFT JOIN (SELECT users.id AS "$key~0", users.parent_user1 AS "$ref~0" FROM public.users) AS "$join~0" ON users.parent_user1 = "$join~0"."$key~0" LEFT JOIN (SELECT user_metadata.id AS "$key~1", user_metadata.id AS "$ref~1" FROM public2.user_metadata) AS "$join~1" ON users.metadata = "$join~1"."$key~1" GROUP BY "$key~0") AS "$join~0" ON u.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a "back-referencing" Deep Ref with an explicit base "From Item" specifier among multiple', async () => {
            const inputSql =
                `SELECT
  email,
  ((u2) parent_user1 <~ parent_user1 <~ users).metadata ~> id AS m[]
FROM users u1
LEFT JOIN users u2
  ON u1.id = u2.id`;
            const outputSql = `SELECT u1.email AS email, "$join~0"."$ref~0" AS m FROM public.users u1 LEFT JOIN public.users u2 ON u1.id = u2.id LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", JSON_AGG("$join~1"."$ref~1") AS "$ref~0" FROM public.users LEFT JOIN (SELECT users.id AS "$key~0", users.parent_user1 AS "$ref~0" FROM public.users) AS "$join~0" ON users.parent_user1 = "$join~0"."$key~0" LEFT JOIN (SELECT user_metadata.id AS "$key~1", user_metadata.id AS "$ref~1" FROM public2.user_metadata) AS "$join~1" ON users.metadata = "$join~1"."$key~1" GROUP BY "$key~0") AS "$join~0" ON u2.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a "back-back-referencing" Deep Ref', async () => {
            const inputSql =
                `SELECT id, (parent_order <~ parent_order <~ orders) ~> status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status FROM public.orders AS o LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", orders.status AS "$ref~0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.parent_order AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0") AS "$join~0" ON o.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a back-back Ref as column qualifier', async () => {
            const inputSql =
                `SELECT id, (parent_order <~ orders).status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status FROM public.orders AS o LEFT JOIN (SELECT orders.parent_order AS "$key~0", orders.status AS "$ref~0" FROM public.orders) AS "$join~0" ON o.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar a back-back Ref as column qualifier', async () => {
            const inputSql =
                `SELECT id, (parent_order <~ parent_order <~ orders).status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status FROM public.orders AS o LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", orders.status AS "$ref~0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.parent_order AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0") AS "$join~0" ON o.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar into a single JOIN multiple "back-back-referencing" Deep Refs as column qualifier', async () => {
            const inputSql =
                `SELECT
  id,
  (parent_order <~ parent_order <~ orders).status AS status2,
  (parent_order <~ parent_order <~ orders).status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS status2, "$join~0"."$ref~1" AS status FROM public.orders AS o LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", orders.status AS "$ref~0", orders.status AS "$ref~1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.parent_order AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0") AS "$join~0" ON o.id = "$join~0"."$key~0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar into distinct JOINS multiple "back-back-referencing" Deep Refs as column qualifier', async () => {
            const inputSql =
                `SELECT
  id,
  (parent_order <~ parent_order <~ orders).status AS statuses[],
  (parent_order <~ parent_order <~ orders).status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS statuses, "$join~1"."$ref~1" AS status FROM public.orders AS o LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", JSON_AGG(orders.status) AS "$ref~0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.parent_order AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0" GROUP BY "$key~0") AS "$join~0" ON o.id = "$join~0"."$key~0" LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~1", orders.status AS "$ref~1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.parent_order AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0") AS "$join~1" ON o.id = "$join~1"."$key~1"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse and deSugar into distinct JOINS multiple "back-back-referencing" Deep Refs as column qualifier', async () => {
            const inputSql =
                `SELECT
  id,
  (parent_order <~ parent_order <~ orders).status AS statuses[],
  (parent_order <~ parent_order <~ orders).order_total as order_totals[],
  (parent_order <~ parent_order <~ orders).status
FROM orders AS o`;
            const outputSql = `SELECT o.id AS id, "$join~0"."$ref~0" AS statuses, "$join~0"."$ref~1" AS order_totals, "$join~1"."$ref~2" AS status FROM public.orders AS o LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", JSON_AGG(orders.status) AS "$ref~0", JSON_AGG(orders.order_total) AS "$ref~1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.parent_order AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0" GROUP BY "$key~0") AS "$join~0" ON o.id = "$join~0"."$key~0" LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~1", orders.status AS "$ref~2" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key~0", orders.parent_order AS "$ref~0" FROM public.orders) AS "$join~0" ON orders.parent_order = "$join~0"."$key~0") AS "$join~1" ON o.id = "$join~1"."$key~1"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });
});

$describe('DeSugaring - Multi-dimensional INSERT Statements', () => {

    $describe('INSERT ... VALUES', () => {

        $it('should parse a basic deep INSERT ... VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, parent_user1 ~> (id, email))
VALUES
  ('dd', ROW (50, 20)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$dependency~0" AS (INSERT INTO public.users (id, email) VALUES ROW (50, 20), ROW (5, 2000) RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (email, parent_user1) VALUES ROW ('dd', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 1)), ROW ('dffff', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 2))`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" INSERT ... VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, parent_user1 ~> parent_user1 ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$dependency~1" AS (INSERT INTO public.users (id, email) VALUES ROW (50, 2100), ROW (5, 2000) RETURNING users.id), "$dependency~1~indices" AS (SELECT "$dependency~1".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~1"), "$dependency~0" AS (INSERT INTO public.users (parent_user1) VALUES ROW ((SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = 1)), ROW ((SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = 2)) RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (email, parent_user1) VALUES ROW ('dd', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 1)), ROW ('dffff', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 2))`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep INSERT ... VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, (parent_user2 <~ users) ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) VALUES ROW ('dd'), ROW ('dffff') RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependent~0" AS (INSERT INTO public.users (id, email, parent_user2) VALUES ROW (50, 2100, (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 1)), ROW (5, 2000, (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 2))) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" deep INSERT ... VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, (parent_user2 <~ parent_user2 <~ users) ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) VALUES ROW ('dd'), ROW ('dffff') RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 1 RETURNING users.id), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 2 RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (id, email, parent_user2) VALUES ROW (50, 2100, (SELECT "$dependency~0".id FROM "$dependency~0")), ROW (5, 2000, (SELECT "$dependency~1".id FROM "$dependency~1"))) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" "deep-deep" INSERT ... VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) VALUES ROW ('dd'), ROW ('dffff') RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (id, email) VALUES ROW (50, 2100), ROW (5, 2000) RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0"), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 1 RETURNING users.id), "$dependency~2" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 2 RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) VALUES ROW ((SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 1), (SELECT "$dependency~1".id FROM "$dependency~1")), ROW ((SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 2), (SELECT "$dependency~2".id FROM "$dependency~2"))) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('INSERT ... DEFAULT VALUES', () => {

        $it('should parse a basic deep INSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$dependency~0" AS (INSERT INTO public.users (username, email) DEFAULT VALUES RETURNING users.id) INSERT INTO public.users (email, parent_user1) VALUES ROW (DEFAULT, (SELECT "$dependency~0".id FROM "$dependency~0"))`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" INSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, parent_user1 ~> parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$dependency~1" AS (INSERT INTO public.users (username, email) DEFAULT VALUES RETURNING users.id), "$dependency~0" AS (INSERT INTO public.users (parent_user1) VALUES ROW ((SELECT "$dependency~1".id FROM "$dependency~1")) RETURNING users.id) INSERT INTO public.users (email, parent_user1) VALUES ROW (DEFAULT, (SELECT "$dependency~0".id FROM "$dependency~0"))`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep INSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, (parent_user2 <~ users) ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) DEFAULT VALUES RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (username, email, parent_user2) VALUES ROW (DEFAULT, DEFAULT, (SELECT "$main~0".id FROM "$main~0"))) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" "deep-deep" INSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, (parent_user2 <~ users) ~> parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) DEFAULT VALUES RETURNING users.id), "$dependency~0" AS (INSERT INTO public.users (username, email) DEFAULT VALUES RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) VALUES ROW ((SELECT "$dependency~0".id FROM "$dependency~0"), (SELECT "$main~0".id FROM "$main~0"))) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" "deep-deep" INSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) DEFAULT VALUES RETURNING users.id), "$dependency~0" AS (INSERT INTO public.users (username, email) DEFAULT VALUES RETURNING users.id), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0".id FROM "$main~0" RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) VALUES ROW ((SELECT "$dependency~0".id FROM "$dependency~0"), (SELECT "$dependency~1".id FROM "$dependency~1"))) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('INSERT ... SELECT', () => {
        $it('should parse a basic deep INSERT ... SELECT statement', async () => {
            const inputSql =
                `INSERT INTO users
  (id, email, parent_user1 ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$dependency~0" AS (INSERT INTO public.users (email) SELECT "$memo~0".rr AS email FROM "$memo~0" RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (id, email, parent_user1) SELECT "$memo~0".id AS id, "$memo~0".email AS email, (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1 FROM "$memo~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" INSERT ... SELECT statement', async () => {
            const inputSql =
                `INSERT INTO users
  (id, email, parent_user1 ~> parent_user1 ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$dependency~1" AS (INSERT INTO public.users (email) SELECT "$memo~0".rr AS email FROM "$memo~0" RETURNING users.id), "$dependency~1~indices" AS (SELECT "$dependency~1".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~1"), "$dependency~0" AS (INSERT INTO public.users (parent_user1) SELECT (SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1 FROM "$memo~0" RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (id, email, parent_user1) SELECT "$memo~0".id AS id, "$memo~0".email AS email, (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1 FROM "$memo~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep INSERT ... SELECT statement', async () => {
            const inputSql =
                `INSERT INTO users
  (id, email, (parent_user2 <~ users) ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$main~0" AS (INSERT INTO public.users (id, email) SELECT "$memo~0".id AS id, "$memo~0".email AS email FROM "$memo~0" RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependent~0" AS (INSERT INTO public.users (email, parent_user2) SELECT "$memo~0".rr AS email, (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0") SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" deep INSERT ... SELECT statement', async () => {
            const inputSql =
                `INSERT INTO users
  (id, email, (parent_user2 <~ parent_user2 <~ users) ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$main~0" AS (INSERT INTO public.users (id, email) SELECT "$memo~0".id AS id, "$memo~0".email AS email FROM "$memo~0" RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (parent_user2) SELECT (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0" RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0"), "$dependent~0" AS (INSERT INTO public.users (email, parent_user2) SELECT "$memo~0".rr AS email, (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0") SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" "deep-deep" INSERT ... SELECT statement', async () => {
            const inputSql =
                `INSERT INTO users
  (username, email, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> (status, email))
SELECT id, order_total AS email, ROW(2, parent_order) AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS username, t.order_total AS email, 2 AS "rr~rand~0", t.parent_order AS "rr~rand~1" FROM public.orders AS t WHERE 1), "$main~0" AS (INSERT INTO public.users (username, email) SELECT "$memo~0".username AS username, "$memo~0".email AS email FROM "$memo~0" RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (status, email) SELECT "$memo~0"."rr~rand~0" AS status, "$memo~0"."rr~rand~1" AS email FROM "$memo~0" RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0"), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0" RETURNING users.id), "$dependency~1~indices" AS (SELECT "$dependency~1".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~1"), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) SELECT (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1, (SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0") SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('INSERT ... ON CONFLICT', () => {
        $it('should parse a basic deep INSERT ... ON CONFLICT statement', async () => {
            const inputSql =
                `INSERT INTO users
  (email, parent_user2)
VALUES
  ('dd', 23),
  ('dffff', 333)
ON CONFLICT (email) DO UPDATE SET
  (parent_user2 <~ users) ~> email = 2
RETURNING id`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email, parent_user2) VALUES ('dd', 23), ('dffff', 333) ON CONFLICT (email) DO UPDATE SET id = users.id RETURNING users.id AS "$key~1", XMAX != 0 AS "$main~0_conflict_based_update", users.id AS "$key~0"), "$dependent~0" AS (UPDATE public.users AS users SET (email) = ROW (2) WHERE users.parent_user2 IN (SELECT users.id FROM "$main~0" WHERE "$main~0"."$main~0_conflict_based_update" IS TRUE)) SELECT "$main~0"."$key~1" AS "$key~1" FROM "$main~0"`;
            await testParseAndStringify('InsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });
});

$describe('DeSugaring - Simple UPSERT Statements', () => {

    $describe('Deep Refs', () => {
        $it('should parse and deSugar a basic Deep Ref', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, parent_user1)
VALUES
  ('dd', 23),
  ('dffff', 333)`;
            const outputSql = `INSERT INTO public.users (email, parent_user1) VALUES ('dd', 23), ('dffff', 333) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, parent_user1 = EXCLUDED.parent_user1`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });
});

$describe('DeSugaring - Multi-dimensional UPSERT Statements', () => {

    $describe('UPSERT ... VALUES', () => {

        $it('should parse a basic deep UPSERT ... VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, parent_user1 ~> (id, email))
VALUES
  ('dd', ROW (50, 20)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$dependency~0" AS (INSERT INTO public.users (id, email) VALUES ROW (50, 20), ROW (5, 2000) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (email, parent_user1) VALUES ROW ('dd', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 1)), ROW ('dffff', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 2)) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, parent_user1 = EXCLUDED.parent_user1`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" UPSERT ... VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, parent_user1 ~> parent_user1 ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$dependency~1" AS (INSERT INTO public.users (id, email) VALUES ROW (50, 2100), ROW (5, 2000) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email RETURNING users.id), "$dependency~1~indices" AS (SELECT "$dependency~1".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~1"), "$dependency~0" AS (INSERT INTO public.users (parent_user1) VALUES ROW ((SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = 1)), ROW ((SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = 2)) ON CONFLICT (id) DO UPDATE SET parent_user1 = EXCLUDED.parent_user1 RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (email, parent_user1) VALUES ROW ('dd', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 1)), ROW ('dffff', (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 2)) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, parent_user1 = EXCLUDED.parent_user1`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep UPSERT ... VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, (parent_user2 <~ users) ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) VALUES ROW ('dd'), ROW ('dffff') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependent~0" AS (INSERT INTO public.users (id, email, parent_user2) VALUES ROW (50, 2100, (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 1)), ROW (5, 2000, (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 2)) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" deep UPSERT ... VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, (parent_user2 <~ parent_user2 <~ users) ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) VALUES ROW ('dd'), ROW ('dffff') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 1 ON CONFLICT (id) DO UPDATE SET parent_user2 = EXCLUDED.parent_user2 RETURNING users.id), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 2 ON CONFLICT (id) DO UPDATE SET parent_user2 = EXCLUDED.parent_user2 RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (id, email, parent_user2) VALUES ROW (50, 2100, (SELECT "$dependency~0".id FROM "$dependency~0")), ROW (5, 2000, (SELECT "$dependency~1".id FROM "$dependency~1")) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" "deep-deep" UPSERT ... VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> (id, email))
VALUES
  ('dd', ROW (50, 2100)),
  ('dffff', ROW (5, 2000))`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) VALUES ROW ('dd'), ROW ('dffff') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (id, email) VALUES ROW (50, 2100), ROW (5, 2000) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0"), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 1 ON CONFLICT (id) DO UPDATE SET parent_user2 = EXCLUDED.parent_user2 RETURNING users.id), "$dependency~2" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = 2 ON CONFLICT (id) DO UPDATE SET parent_user2 = EXCLUDED.parent_user2 RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) VALUES ROW ((SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 1), (SELECT "$dependency~1".id FROM "$dependency~1")), ROW ((SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = 2), (SELECT "$dependency~2".id FROM "$dependency~2")) ON CONFLICT (id) DO UPDATE SET parent_user1 = EXCLUDED.parent_user1, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('UPSERT ... DEFAULT VALUES', () => {

        $it('should parse a basic deep UPSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$dependency~0" AS (INSERT INTO public.users (username, email) DEFAULT VALUES ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email RETURNING users.id) INSERT INTO public.users (email, parent_user1) VALUES ROW (DEFAULT, (SELECT "$dependency~0".id FROM "$dependency~0")) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, parent_user1 = EXCLUDED.parent_user1`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" UPSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, parent_user1 ~> parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$dependency~1" AS (INSERT INTO public.users (username, email) DEFAULT VALUES ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email RETURNING users.id), "$dependency~0" AS (INSERT INTO public.users (parent_user1) VALUES ROW ((SELECT "$dependency~1".id FROM "$dependency~1")) ON CONFLICT (id) DO UPDATE SET parent_user1 = EXCLUDED.parent_user1 RETURNING users.id) INSERT INTO public.users (email, parent_user1) VALUES ROW (DEFAULT, (SELECT "$dependency~0".id FROM "$dependency~0")) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, parent_user1 = EXCLUDED.parent_user1`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep UPSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, (parent_user2 <~ users) ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) DEFAULT VALUES ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (username, email, parent_user2) VALUES ROW (DEFAULT, DEFAULT, (SELECT "$main~0".id FROM "$main~0")) ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" "deep-deep" UPSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, (parent_user2 <~ users) ~> parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) DEFAULT VALUES ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$dependency~0" AS (INSERT INTO public.users (username, email) DEFAULT VALUES ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) VALUES ROW ((SELECT "$dependency~0".id FROM "$dependency~0"), (SELECT "$main~0".id FROM "$main~0")) ON CONFLICT (id) DO UPDATE SET parent_user1 = EXCLUDED.parent_user1, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" "deep-deep" UPSERT ... DEFAULT VALUES statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (email, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> (username, email))
DEFAULT VALUES`;
            const outputSql =
                `WITH "$main~0" AS (INSERT INTO public.users (email) DEFAULT VALUES ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$dependency~0" AS (INSERT INTO public.users (username, email) DEFAULT VALUES ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email RETURNING users.id), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT "$main~0".id FROM "$main~0" ON CONFLICT (id) DO UPDATE SET parent_user2 = EXCLUDED.parent_user2 RETURNING users.id), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) VALUES ROW ((SELECT "$dependency~0".id FROM "$dependency~0"), (SELECT "$dependency~1".id FROM "$dependency~1")) ON CONFLICT (id) DO UPDATE SET parent_user1 = EXCLUDED.parent_user1, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('UPSERT ... SELECT', () => {
        $it('should parse a basic deep UPSERT ... SELECT statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (id, email, parent_user1 ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$dependency~0" AS (INSERT INTO public.users (email) SELECT "$memo~0".rr AS email FROM "$memo~0" ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (id, email, parent_user1) SELECT "$memo~0".id AS id, "$memo~0".email AS email, (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1 FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email, parent_user1 = EXCLUDED.parent_user1`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" UPSERT ... SELECT statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (id, email, parent_user1 ~> parent_user1 ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$dependency~1" AS (INSERT INTO public.users (email) SELECT "$memo~0".rr AS email FROM "$memo~0" ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING users.id), "$dependency~1~indices" AS (SELECT "$dependency~1".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~1"), "$dependency~0" AS (INSERT INTO public.users (parent_user1) SELECT (SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1 FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET parent_user1 = EXCLUDED.parent_user1 RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0") INSERT INTO public.users (id, email, parent_user1) SELECT "$memo~0".id AS id, "$memo~0".email AS email, (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1 FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email, parent_user1 = EXCLUDED.parent_user1`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep UPSERT ... SELECT statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (id, email, (parent_user2 <~ users) ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$main~0" AS (INSERT INTO public.users (id, email) SELECT "$memo~0".id AS id, "$memo~0".email AS email FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependent~0" AS (INSERT INTO public.users (email, parent_user2) SELECT "$memo~0".rr AS email, (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0" ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" deep UPSERT ... SELECT statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (id, email, (parent_user2 <~ parent_user2 <~ users) ~> email)
SELECT id, order_total AS email, parent_order AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS id, t.order_total AS email, t.parent_order AS rr FROM public.orders AS t WHERE 1), "$main~0" AS (INSERT INTO public.users (id, email) SELECT "$memo~0".id AS id, "$memo~0".email AS email FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (parent_user2) SELECT (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET parent_user2 = EXCLUDED.parent_user2 RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0"), "$dependent~0" AS (INSERT INTO public.users (email, parent_user2) SELECT "$memo~0".rr AS email, (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0" ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" "deep-deep" UPSERT ... SELECT statement', async () => {
            const inputSql =
                `UPSERT INTO users
  (username, email, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> (status, email))
SELECT id, order_total AS email, ROW(2, parent_order) AS rr
FROM orders as t
WHERE 1`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", t.id AS username, t.order_total AS email, 2 AS "rr~rand~0", t.parent_order AS "rr~rand~1" FROM public.orders AS t WHERE 1), "$main~0" AS (INSERT INTO public.users (username, email) SELECT "$memo~0".username AS username, "$memo~0".email AS email FROM "$memo~0" ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email RETURNING users.id), "$main~0~indices" AS (SELECT "$main~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$main~0"), "$dependency~0" AS (INSERT INTO public.users (status, email) SELECT "$memo~0"."rr~rand~0" AS status, "$memo~0"."rr~rand~1" AS email FROM "$memo~0" ON CONFLICT (email) DO UPDATE SET status = EXCLUDED.status, email = EXCLUDED.email RETURNING users.id), "$dependency~0~indices" AS (SELECT "$dependency~0".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~0"), "$dependency~1" AS (INSERT INTO public.users (parent_user2) SELECT (SELECT "$main~0~indices".id FROM "$main~0~indices" WHERE "$main~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET parent_user2 = EXCLUDED.parent_user2 RETURNING users.id), "$dependency~1~indices" AS (SELECT "$dependency~1".id AS id, ROW_NUMBER() OVER () AS "$row_number~b" FROM "$dependency~1"), "$dependent~0" AS (INSERT INTO public.users (parent_user1, parent_user2) SELECT (SELECT "$dependency~0~indices".id FROM "$dependency~0~indices" WHERE "$dependency~0~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user1, (SELECT "$dependency~1~indices".id FROM "$dependency~1~indices" WHERE "$dependency~1~indices"."$row_number~b" = "$memo~0"."$row_number~a") AS parent_user2 FROM "$memo~0" ON CONFLICT (id) DO UPDATE SET parent_user1 = EXCLUDED.parent_user1, parent_user2 = EXCLUDED.parent_user2) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpsertStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });
});

$describe('DeSugaring - Multi-dimensional UPDATE Statements', () => {

    $describe('UPDATE', () => {
        $it('should parse a basic deep UPDATE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, parent_user1 ~> id) = (232, 3445)`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username, parent_user1) = ROW (232, u.parent_user1) RETURNING u.parent_user1), "$dependency~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~0".parent_user1 FROM "$main~0")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" UPDATE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, parent_user1 ~> parent_user1 ~> id) = (232, 3445)`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username, parent_user1) = ROW (232, u.parent_user1) RETURNING u.parent_user1), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) WHERE users.id IN (SELECT "$main~0".parent_user1 FROM "$main~0") RETURNING users.parent_user1), "$dependency~1" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep UPDATE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, (parent_user2 <~ users) ~> id) = (232, 3445)`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username) = ROW (232) RETURNING u.id), "$dependent~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.parent_user2 IN (SELECT "$main~0".id FROM "$main~0")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" deep UPDATE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, (parent_user2 <~ users) ~> parent_user1 ~> id) = (232, 3445)`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username) = ROW (232) RETURNING u.id), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) WHERE users.parent_user2 IN (SELECT "$main~0".id FROM "$main~0") RETURNING users.parent_user1), "$dependency~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" "deep-deep" UPDATE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> id) = (222, 3445)`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username) = ROW (222) RETURNING u.id), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) FROM (SELECT users.id AS id, users.parent_user2 AS parent_user2 FROM public.users) AS "$join~1:users" LEFT JOIN (SELECT users.id AS "$key~0", users.parent_user2 AS "$ref~0" FROM public.users) AS "$join~0" ON "$join~1:users".parent_user2 = "$join~0"."$key~0" WHERE users.id = "$join~1:users".id AND "$join~0"."$ref~0" IN (SELECT "$main~0".id FROM "$main~0") RETURNING users.parent_user1), "$dependency~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('UPDATE ... WHERE', () => {
        $it('should parse a basic deep UPDATE ... WHERE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, parent_user1 ~> id) = (232, 3445)
WHERE parent_user1 ~> id = 2`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username, parent_user1) = ROW (232, u.parent_user1) FROM (SELECT users.id AS id, u.parent_user1 AS parent_user1 FROM public.users) AS "$join~1:u" LEFT JOIN (SELECT users.id AS "$key~0", users.id AS "$ref~0" FROM public.users) AS "$join~0" ON "$join~1:u".parent_user1 = "$join~0"."$key~0" WHERE u.id = "$join~1:u".id AND "$join~0"."$ref~0" = 2 RETURNING u.parent_user1), "$dependency~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~0".parent_user1 FROM "$main~0")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" UPDATE ... WHERE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, parent_user1 ~> parent_user1 ~> id) = (232, 3445)
WHERE parent_user1 ~> id = 2`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username, parent_user1) = ROW (232, u.parent_user1) FROM (SELECT users.id AS id, u.parent_user1 AS parent_user1 FROM public.users) AS "$join~1:u" LEFT JOIN (SELECT users.id AS "$key~0", users.id AS "$ref~0" FROM public.users) AS "$join~0" ON "$join~1:u".parent_user1 = "$join~0"."$key~0" WHERE u.id = "$join~1:u".id AND "$join~0"."$ref~0" = 2 RETURNING u.parent_user1), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) WHERE users.id IN (SELECT "$main~0".parent_user1 FROM "$main~0") RETURNING users.parent_user1), "$dependency~1" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-referencing" deep UPDATE ... WHERE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, (parent_user2 <~ users) ~> id) = (232, 3445)
WHERE parent_user1 ~> id = 2`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username) = ROW (232) FROM (SELECT users.id AS id, u.parent_user1 AS parent_user1 FROM public.users) AS "$join~1:u" LEFT JOIN (SELECT users.id AS "$key~0", users.id AS "$ref~0" FROM public.users) AS "$join~0" ON "$join~1:u".parent_user1 = "$join~0"."$key~0" WHERE u.id = "$join~1:u".id AND "$join~0"."$ref~0" = 2 RETURNING u.id), "$dependent~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.parent_user2 IN (SELECT "$main~0".id FROM "$main~0")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" deep UPDATE ... WHERE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, (parent_user2 <~ users) ~> parent_user1 ~> id) = (232, 3445)
WHERE parent_user1 ~> id = 2`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username) = ROW (232) FROM (SELECT users.id AS id, u.parent_user1 AS parent_user1 FROM public.users) AS "$join~1:u" LEFT JOIN (SELECT users.id AS "$key~0", users.id AS "$ref~0" FROM public.users) AS "$join~0" ON "$join~1:u".parent_user1 = "$join~0"."$key~0" WHERE u.id = "$join~1:u".id AND "$join~0"."$ref~0" = 2 RETURNING u.id), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) WHERE users.parent_user2 IN (SELECT "$main~0".id FROM "$main~0") RETURNING users.parent_user1), "$dependency~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" "deep-deep" UPDATE ... WHERE statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, (parent_user2 <~ parent_user2 <~ users) ~> parent_user1 ~> id) = (222, 3445)
WHERE parent_user1 ~> id = 2`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username) = ROW (222) FROM (SELECT users.id AS id, u.parent_user1 AS parent_user1 FROM public.users) AS "$join~1:u" LEFT JOIN (SELECT users.id AS "$key~0", users.id AS "$ref~0" FROM public.users) AS "$join~0" ON "$join~1:u".parent_user1 = "$join~0"."$key~0" WHERE u.id = "$join~1:u".id AND "$join~0"."$ref~0" = 2 RETURNING u.id), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) FROM (SELECT users.id AS id, users.parent_user2 AS parent_user2 FROM public.users) AS "$join~1:users" LEFT JOIN (SELECT users.id AS "$key~0", users.parent_user2 AS "$ref~0" FROM public.users) AS "$join~0" ON "$join~1:users".parent_user2 = "$join~0"."$key~0" WHERE users.id = "$join~1:users".id AND "$join~0"."$ref~0" IN (SELECT "$main~0".id FROM "$main~0") RETURNING users.parent_user1), "$dependency~0" AS (UPDATE public.users AS users SET (id) = ROW (3445) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });

    $describe('UPDATE ... SELECT', () => {
        $it('should parse a basic deep UPDATE ... SELECT statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, parent_user1 ~> (id, username)) = (
    SELECT 232, (3445, 333)
    FROM orders
  )`;
            const outputSql =
                `WITH "$memo~0" AS (SELECT ROW_NUMBER() OVER () AS "$row_number~a", 232 AS username, 3445 AS "$value~0", 333 AS "$value~1" FROM public.orders), "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username, parent_user1) = (SELECT "$memo~0".username AS username, u.parent_user1 AS parent_user1 FROM "$memo~0") RETURNING u.parent_user1), "$dependency~0" AS (UPDATE public.users AS users SET (id, username) = (SELECT "$memo~0"."$value~0" AS "$value~0", "$memo~0"."$value~1" AS "$value~1" FROM "$memo~0") WHERE users.id IN (SELECT "$main~0".parent_user1 FROM "$main~0")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "deep-deep" UPDATE ... SELECT statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, parent_user1 ~> parent_user1 ~> (id, username)) = (232, (
    SELECT 3445, 333
    FROM orders
  ))`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username, parent_user1) = ROW (232, u.parent_user1) RETURNING u.parent_user1), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) WHERE users.id IN (SELECT "$main~0".parent_user1 FROM "$main~0") RETURNING users.parent_user1), "$dependency~1" AS (UPDATE public.users AS users SET (id, username) = (SELECT 3445, 333 FROM public.orders) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });

        $it('should parse a "back-back-referencing" "deep-deep" UPDATE ... SELECT statement', async () => {
            const inputSql =
                `UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, parent_user1 ~> parent_user1 ~> (id, username)) = (232, (
    SELECT 3445, 333
    FROM orders
  ))`;
            const outputSql =
                `WITH "$main~0" AS (UPDATE public.users AS u SET id = 2, email = 'x@x.com', (username, parent_user1) = ROW (232, u.parent_user1) RETURNING u.parent_user1), "$main~1" AS (UPDATE public.users AS users SET (parent_user1) = ROW (users.parent_user1) WHERE users.id IN (SELECT "$main~0".parent_user1 FROM "$main~0") RETURNING users.parent_user1), "$dependency~1" AS (UPDATE public.users AS users SET (id, username) = (SELECT 3445, 333 FROM public.orders) WHERE users.id IN (SELECT "$main~1".parent_user1 FROM "$main~1")) SELECT COUNT(*) AS COUNT FROM "$main~0"`;
            await testParseAndStringify('UpdateStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });
});

$describe('DeSugaring - Multi-dimensional DELETE Statements', () => {

    $describe('Deep Refs', () => {
        $it('should parse and deSugar a basic Deep Ref', async () => {
            const inputSql =
                `DELETE FROM users
WHERE (parent_user2 <~ parent_user2 <~ users) ~> id = 3`;
            const outputSql = `DELETE FROM public.users AS users USING (SELECT users.id FROM public.users) AS "$join~1:users" LEFT JOIN (SELECT "$join~0"."$ref~0" AS "$key~0", users.id AS "$ref~0" FROM public.users LEFT JOIN (SELECT users.id AS "$key~0", users.parent_user2 AS "$ref~0" FROM public.users) AS "$join~0" ON users.parent_user2 = "$join~0"."$key~0") AS "$join~0" ON "$join~1:users".id = "$join~0"."$key~0" WHERE users.id = "$join~1:users".id AND "$join~0"."$ref~0" = 3`;
            await testParseAndStringify('DeleteStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, schemaInference);
        });
    });
});