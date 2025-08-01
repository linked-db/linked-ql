import { expect } from 'chai';
import { $describe, $it, testParseAndStringify } from './00.parser.js';
import { LinkedDB } from '../src/db/LinkedDB.js';
import { registry } from '../src/lang/registry.js';

// Select list being an object
// PGArrayLiteral|LQObjectLiteral|LQArrayLiteral|LQObjectProperty|SelectElement - with [],
// SchemaRef|TableRef @v

// IdentifierPath (fullyQualified), PayloadStmtMixin, SelectorStmtMixin, UpsertStmt,
// REFS, LQBackRefConstructor


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

    $describe('PGArrayLiteral', () => {
        $it('should parse an "PGArrayLiteral" expr toDialect: mysql', async () => {
            const inputSql = `ARRAY['value1', 'value2']`;
            const outputSql = `JSON_ARRAY('value1', 'value2')`;
            await testParseAndStringify('PGArrayLiteral', [inputSql, outputSql], { toDialect: 'mysql' });
        });
    });

    $describe('SelectElement', () => {
        $it('should parse an "SelectElement" expr with an aggregation syntax - Postgres', async () => {
            const inputSql = `col AS alias[]`;
            const outputSql = `JSON_AGG(col) AS alias`;
            await testParseAndStringify('SelectElement', [inputSql, outputSql], { toDialect: 'postgres' });
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - MySQL', async () => {
            const inputSql = `col AS alias[]`;
            const outputSql = `JSON_ARRAYAGG(col) AS alias`;
            await testParseAndStringify('SelectElement', [inputSql, outputSql], { toDialect: 'mysql' });
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - Postgres', async () => {
            const inputSql = `col + 1 - 3 alias[]`;
            const outputSql = `JSON_AGG(col + 1 - 3) alias`;
            await testParseAndStringify('SelectElement', [inputSql, outputSql], { toDialect: 'postgres' });
        });

        $it('should parse an "SelectElement" expr with an aggregation syntax - MySQL', async () => {
            const inputSql = `col + 1 - 3 alias[]`;
            const outputSql = `JSON_ARRAYAGG(col + 1 - 3) alias`;
            await testParseAndStringify('SelectElement', [inputSql, outputSql], { toDialect: 'mysql' });
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

    let linkedDB;

    $it('should establish the linkedDB object with test catalog', async () => {
        const { catalog } = await import('./01.catalog.parser.js');
        linkedDB = new LinkedDB({ catalog });
    });

    $describe('TableRef', () => {
        $it('should parse a bare "TableRef" to a fully-qualified TableRef', async () => {
            const inputSql = `users`;
            const outputSql = `public.users`;
            await testParseAndStringify('TableRef', [inputSql, outputSql], { deSugar: true }, linkedDB);
        });

        $it('should parse an in-query bare "TableRef" to a fully-qualified TableRef', async () => {
            const inputSql = `SELECT * FROM users`;
            const outputSql = `SELECT * FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, linkedDB);
        });
    });

    $describe('ColumnRef', () => {
        $it('should parse a bare "ColumnRef" to a fully-qualified ColumnRef', async () => {
            const inputSql = `username`;
            const outputSql = `public.users.username`;
            await testParseAndStringify('ColumnRef', [inputSql, outputSql], { deSugar: true }, linkedDB);
        });

        $it('should parse an in-query bare "ColumnRef" to a fully-qualified ColumnRef', async () => {
            const inputSql = `SELECT username FROM users`;
            const outputSql = `SELECT users.username FROM public.users`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, linkedDB);
        });

        $it('should parse an in-query bare "ColumnRef" to a fully-qualified ColumnRef', async () => {
            const inputSql = `SELECT order_id FROM orders AS o`;
            const outputSql = `SELECT o.order_id FROM public.orders AS o`;
            await testParseAndStringify('BasicSelectStmt', [inputSql, outputSql], { deSugar: true }, linkedDB);
        });
    });
});