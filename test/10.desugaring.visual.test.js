import { expect } from 'chai';
import { $describe, $it, testParseAndStringify } from './00.parser.js';
import { LinkedDB } from '../src/db/LinkedDB.js';
import { registry } from '../src/lang/registry.js';

// Select list being an object
// PGTypedArrayLiteral|LQObjectLiteral|LQArrayLiteral|LQObjectProperty|SelectElement - with [],
// SchemaRef | TableRef @version_specs

// IdentifierPath (fullyQualified),
// REFS, LQBackRefConstructor, SelectorStmtMixin, PayloadStmtMixin, UpsertStmt,


$describe('Parser - Expr DeSugaring', () => {
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
            const inputSql = `SELECT col AS alias[]`;
            const outputSql = `SELECT JSON_AGG(col) AS alias`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { toDialect: 'postgres' });
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - MySQL', async () => {
            const inputSql = `SELECT col AS alias[]`;
            const outputSql = `SELECT JSON_ARRAYAGG(col) AS alias`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { toDialect: 'mysql' });
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - Postgres', async () => {
            const inputSql = `SELECT col + 1 - 3 alias[]`;
            const outputSql = `SELECT JSON_AGG(col + 1 - 3) alias`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { toDialect: 'postgres' });
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - MySQL', async () => {
            const inputSql = `SELECT col + 1 - 3 alias[]`;
            const outputSql = `SELECT JSON_ARRAYAGG(col + 1 - 3) alias`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { toDialect: 'mysql' });
        });
    });

    $describe('VersionSpec', () => {
        $it('should parse an "SchemaRef" with version spec to just the SchemaRef - Postgres', async () => {
            const inputSql = `schema1@3_3`;
            const outputSql = `schema1`;
            await testParseAndStringify('SchemaRef', [inputSql, outputSql], { deSugar: true });
        });

        $it('should parse an "TableRef" with version spec to just the TableRef - Postgres', async () => {
            const inputSql = `tbl@3_3`;
            const outputSql = `tbl`;
            await testParseAndStringify('TableRef', [inputSql, outputSql], { deSugar: true });
        });
    });

    $describe('LQObjectLiteral As Root Select List', () => {
        $it('should parse an "SelectStmt" with un-aliased LQObjectLiteral as root select list - Postgres', async () => {
            const inputSql = `SELECT { col1, col2, col3[]: col3 + 4 }`;
            const outputSql = `SELECT col1 AS col1, col2 AS col2, JSON_AGG(col3 + 4) AS col3`;
            await testParseAndStringify('SelectStmt', [inputSql, outputSql], { toDialect: 'postgres' });
        });

        $it('should parse an "SelectStmt" with un-aliased LQObjectLiteral as root select list - MySQL', async () => {
            const inputSql = `SELECT { col1, col2, col3[]: col3 + 4 }`;
            const outputSql = `SELECT col1 AS col1, col2 AS col2, JSON_ARRAYAGG(col3 + 4) AS col3`;
            await testParseAndStringify('SelectStmt', [inputSql, outputSql], { toDialect: 'mysql' });
        });
    });

    $describe('LQBackBackRef', () => {
        $it('should parse and reverse an "LQBackBackRef" to an LQDeepRef', async () => {
            const backRef = await testParseAndStringify('Expr', 'fk3 <~ fk2 <~ fk1 <~ tbl');
            const backBackRef = backRef.left();
            expect(backBackRef).to.be.instanceOf(registry['LQBackBackRef']);
            const deepRef = backBackRef.clone({ reverseRef: true });
            expect(deepRef).to.be.instanceOf(registry['LQDeepRef']);
        });
    });
});

$describe('Parser - Refs Resolution Using a Test Linked DB Instance', () => {

    let linkedDb;

    $it('should establish the linkedDb object with test catalog', async () => {
        const { catalog } = await import('./01.catalog.parser.js');
        linkedDb = new LinkedDB({ catalog });

        /*
        const tblSchemaUsers = [...linkedDb.catalog].find((s) => s.name().value() === 'public')._get('entries', 'users');
        const emailColumn = tblSchemaUsers._get('entries', 'email');
        const passwordHashColumn = tblSchemaUsers._get('entries', 'password_hash');
        console.log([
            emailColumn.ckConstraint(true).columns(),
            passwordHashColumn.ckConstraint(true).columns()
        ]);
        */
    });

    $describe('TableRef', () => {
        $it('should parse a bare "TableRef" to a fully-qualified TableRef', async () => {
            const inputSql = `users`;
            const outputSql = `public.users`;
            await testParseAndStringify('TableRef', [inputSql, outputSql], { deSugar: true }, linkedDb);
        });

        $it('should parse an in-query bare "TableRef" to a fully-qualified TableRef', async () => {
            const inputSql = `SELECT * FROM users`;
            const outputSql = `SELECT * FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, linkedDb);
        });
    });

    $describe('ColumnRef', () => {
        $it('should parse and fully-qualify a bare "ColumnRef"', async () => {
            const inputSql = `username`;
            const outputSql = `public.users.username`;
            await testParseAndStringify('ColumnRef', [inputSql, outputSql], { deSugar: true }, linkedDb);
        });

        $it('should parse and fully-qualify an in-query bare "ColumnRef"', async () => {
            const inputSql = `SELECT username FROM users`;
            const outputSql = `SELECT users.username FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, linkedDb);
        });

        $it('should parse and fully-qualify an in-query bare "ColumnRef"', async () => {
            const inputSql = `SELECT id FROM orders AS o`;
            const outputSql = `SELECT o.id FROM public.orders AS o`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, linkedDb);
        });
    });

    $describe('LQDeepRef', () => {
        $it('should parse and deSugar an in-query "LQDeepRef"', async () => {
            const inputSql =
                `SELECT
  id, user ~> email 
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" FROM public.orders AS o LEFT JOIN (SELECT users.id AS "$key0", users.email AS "$ref0" FROM public.users) AS "$join0" ON o.user = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar an in-query "LQDeepRef"', async () => {
            const inputSql =
                `SELECT
  id, parent_order ~> parent_order ~> status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" FROM public.orders AS o LEFT JOIN (SELECT orders.id AS "$key0", "$join1"."$ref1" AS "$ref0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key1", orders.status AS "$ref1" FROM public.orders) AS "$join1" ON orders.parent_order = "$join1"."$key1") AS "$join0" ON o.parent_order = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar multiple in-query "LQDeepRef" - multiple but resolved from a shared JOIN', async () => {
            const inputSql =
                `SELECT
  id,
  parent_order ~> parent_order ~> status,
  parent_order ~> parent_order
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0", "$join0"."$ref1" FROM public.orders AS o LEFT JOIN (SELECT orders.id AS "$key0", "$join1"."$ref2" AS "$ref0", "$join1"."$ref3" AS "$ref1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key1", orders.status AS "$ref2", orders.status AS "$ref3" FROM public.orders) AS "$join1" ON orders.parent_order = "$join1"."$key1") AS "$join0" ON o.parent_order = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar a subquery-level "LQDeepRef"', async () => {
            const inputSql =
                `SELECT
  id, u.parent_user ~> email AS outerParentEmail, innerParentEmail
  FROM orders AS o
  CROSS JOIN (SELECT parent_user, parent_user ~> email AS innerParentEmail
      FROM users) AS u`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" AS outerParentEmail, u.innerParentEmail FROM public.orders AS o CROSS JOIN (SELECT users.parent_user, "$join1"."$ref1" AS innerParentEmail FROM public.users LEFT JOIN (SELECT users.id AS "$key1", users.email AS "$ref1" FROM public.users) AS "$join1" ON users.parent_user = "$join1"."$key1") AS u LEFT JOIN (SELECT users.id AS "$key0", users.email AS "$ref0" FROM public.users) AS "$join0" ON u.parent_user = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar a subquery-derived "LQDeepRef"', async () => {
            const inputSql =
                `SELECT
  id, u.parent ~> email AS outerParentEmail, innerParentEmail
  FROM orders AS o
  CROSS JOIN (SELECT parent_user AS parent, parent_user ~> email AS innerParentEmail
      FROM users) AS u`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" AS outerParentEmail, u.innerParentEmail FROM public.orders AS o CROSS JOIN (SELECT users.parent_user AS parent, "$join1"."$ref1" AS innerParentEmail FROM public.users LEFT JOIN (SELECT users.id AS "$key1", users.email AS "$ref1" FROM public.users) AS "$join1" ON users.parent_user = "$join1"."$key1") AS u LEFT JOIN (SELECT users.id AS "$key0", users.email AS "$ref0" FROM public.users) AS "$join0" ON u.parent = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar a superquery-derived (LATERAL) "LQDeepRef"', async () => {
            globalThis.testMode = true;
            const inputSql =
                `SELECT
  id, parent_user ~> email AS outerParentEmail, parent_order, innerParentEmail
  FROM users AS u
  CROSS JOIN LATERAL (SELECT parent_order, parent_user ~> id AS innerParentEmail
      FROM orders) AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" AS outerParentEmail FROM public.orders AS o CROSS JOIN (SELECT users.parent_user AS parent, "$join1"."$ref1" AS innerParentEmail FROM public.users LEFT JOIN (SELECT users.id AS "$key1", users.email AS "$ref1" FROM public.users) AS "$join1" ON users.parent_user = "$join1"."$key1") AS u LEFT JOIN (SELECT users.id AS "$key0", users.email AS "$ref0" FROM public.users) AS "$join0" ON u.parent = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
            globalThis.testMode = false;
        });
    });

    $describe('LQBackRef', () => {
        $it('should parse and deSugar an in-query "(Back) LQDeepRef"', async () => {
            const inputSql =
                `SELECT
  id, (parent_order <~ orders) ~> status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" FROM public.orders AS o LEFT JOIN (SELECT orders.parent_order AS "$key0", orders.status AS "$ref0" FROM public.orders) AS "$join0" ON orders.id = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar an in-query "(Back) LQDeepRef" with an aggregation syntax', async () => {
            const inputSql =
                `SELECT
  id, (parent_order <~ orders) ~> status AS status[]
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" AS status FROM public.orders AS o LEFT JOIN (SELECT orders.parent_order AS "$key0", (JSON_AGG(orders.status)) AS "$ref0" FROM public.orders GROUP BY "$key0") AS "$join0" ON orders.id = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar an in-query "(Back Back) LQDeepRef"', async () => {
            const inputSql =
                `SELECT
  id, (parent_order <~ parent_order <~ orders) ~> status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" FROM public.orders AS o LEFT JOIN (SELECT "$join1"."$ref1" AS "$key0", orders.status AS "$ref0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key1", orders.parent_order AS "$ref1" FROM public.orders) AS "$join1" ON orders.parent_order = "$join1"."$key1") AS "$join0" ON orders.id = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar an in-query "(Back) LQDeepRef" being column qualifier', async () => {
            const inputSql =
                `SELECT
  id, (parent_order <~ orders).status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" FROM public.orders AS o LEFT JOIN (SELECT orders.parent_order AS "$key0", orders.status AS "$ref0" FROM public.orders) AS "$join0" ON orders.id = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar an in-query "(Back Back) LQDeepRef" being column qualifier', async () => {
            const inputSql =
                `SELECT
  id, (parent_order <~ parent_order <~ orders).status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" FROM public.orders AS o LEFT JOIN (SELECT "$join1"."$ref1" AS "$key0", orders.status AS "$ref0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key1", orders.parent_order AS "$ref1" FROM public.orders) AS "$join1" ON orders.parent_order = "$join1"."$key1") AS "$join0" ON orders.id = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar multiple in-query "(Back Back) LQDeepRef" being column qualifier - multiple but resolved from a shared JOIN', async () => {
            const inputSql =
                `SELECT
  id,
  (parent_order <~ parent_order <~ orders).status AS status,
  (parent_order <~ parent_order <~ orders).status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" AS status, "$join0"."$ref1" FROM public.orders AS o LEFT JOIN (SELECT "$join1"."$ref2" AS "$key0", orders.status AS "$ref0", orders.status AS "$ref1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key1", orders.parent_order AS "$ref2" FROM public.orders) AS "$join1" ON orders.parent_order = "$join1"."$key1") AS "$join0" ON orders.id = "$join0"."$key0"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar multiple in-query "(Back Back) LQDeepRef" being column qualifier - multiple and resolved from distinct JOINS', async () => {
            const inputSql =
                `SELECT
  id,
  (parent_order <~ parent_order <~ orders).status AS status[],
  (parent_order <~ parent_order <~ orders).status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" AS status, "$join1"."$ref1" FROM public.orders AS o LEFT JOIN (SELECT "$join2"."$ref2" AS "$key0", (JSON_AGG(orders.status)) AS "$ref0" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key2", orders.parent_order AS "$ref2" FROM public.orders) AS "$join2" ON orders.parent_order = "$join2"."$key2" GROUP BY "$key0") AS "$join0" ON orders.id = "$join0"."$key0" LEFT JOIN (SELECT "$join3"."$ref3" AS "$key1", orders.status AS "$ref1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key3", orders.parent_order AS "$ref3" FROM public.orders) AS "$join3" ON orders.parent_order = "$join3"."$key3") AS "$join1" ON orders.id = "$join1"."$key1"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });

        $it('should parse and deSugar multiple in-query "(Back Back) LQDeepRef" being column qualifier - multiple and resolved from distinct JOINS', async () => {
            const inputSql =
                `SELECT
  id,
  (parent_order <~ parent_order <~ orders).status AS status[],
  (parent_order <~ parent_order <~ orders).order_total as order_total[],
  (parent_order <~ parent_order <~ orders).status
  FROM orders AS o`;
            const outputSql = `SELECT o.id, "$join0"."$ref0" AS status, "$join0"."$ref1" AS order_total, "$join1"."$ref2" FROM public.orders AS o LEFT JOIN (SELECT "$join2"."$ref3" AS "$key0", (JSON_AGG(orders.status)) AS "$ref0", (JSON_AGG(orders.status)) AS "$ref1" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key2", orders.parent_order AS "$ref3" FROM public.orders) AS "$join2" ON orders.parent_order = "$join2"."$key2" GROUP BY "$key0") AS "$join0" ON orders.id = "$join0"."$key0" LEFT JOIN (SELECT "$join3"."$ref4" AS "$key1", orders.status AS "$ref2" FROM public.orders LEFT JOIN (SELECT orders.id AS "$key3", orders.parent_order AS "$ref4" FROM public.orders) AS "$join3" ON orders.parent_order = "$join3"."$key3") AS "$join1" ON orders.id = "$join1"."$key1"`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true, prettyPrint: true }, linkedDb);
        });
    });
});