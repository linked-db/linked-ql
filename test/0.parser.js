import { expect } from 'chai';
import { registry } from '../src/lang/registry.js';
import '../src/lang/index.js';
import chalk from 'chalk';

// --- Test Helpers ---

let activeIndentation = 0;
export async function $describe(text, callback) {
    activeIndentation++;
    describe(text, () => callback());
    activeIndentation--;
}

let log;
const baseIndentation = '    ';
export function $it(text, callback) {
    const indentation = activeIndentation;

    it(text, (done) => {
        log = new Set;

        Promise.resolve(callback()).then(() => {
            const $log = log;
            done();

            for (const { entryPoint, nodeName, sql, options, resultNode } of $log) {
                const formattingOptions = { prettyPrint: options.prettyPrint, indentation };
                console.log(
                    baseIndentation + ('  '.repeat(indentation))
                    + chalk.green('∟'),
                    chalk.gray(entryPoint) + ' '.repeat(Math.max(0, 15 - entryPoint.length - 2)) + chalk.gray(`.parse(`)
                    + chalk.green(formatSql(sql, formattingOptions))
                    + chalk.gray(`)`),
                    chalk.gray(formatSql(`<${nodeName}>`, formattingOptions)),
                    chalk.green(formatSql(resultNode?.stringify(options), formattingOptions)),
                );
            }
        }).catch(done);
    });
}

export async function testParseAndStringify(entryPoint, sql, options = {}) {
    let nodeName = entryPoint;
    if (Array.isArray(entryPoint)) {
        [entryPoint, nodeName] = entryPoint;
    }

    const resultNode = await registry[entryPoint].parse(sql, options);
    log?.add({ entryPoint, nodeName, sql, options, resultNode });

    expect(resultNode).to.be.instanceOf(registry[nodeName]);

    const normalizerOptions = { stripSpaces: options.stripSpaces, stripQuotes: options.stripQuotes };
    expect(
        normalizeSql(resultNode.stringify(options))
    ).to.equal(normalizeSql(sql, normalizerOptions));

    const resultClone = registry[entryPoint].fromJSON(resultNode.jsonfy(), resultNode.options);
    expect(resultClone).to.be.instanceOf(registry[nodeName]);

    expect(
        normalizeSql(resultClone.stringify(options))
    ).to.equal(normalizeSql(sql, normalizerOptions));

    return resultNode;
}

export async function testExprAndNodeEntryPoints(nodeName, sql, options = {}) {
    //return await testParseAndStringify(['Expr', nodeName], sql, options);
    const entryPoints = ['Expr', nodeName];
    for (const entryPoint of entryPoints) {
        await testParseAndStringify([entryPoint, nodeName], sql, options);
    }
}

export function normalizeSql(sql, normalizerOptions = {}) {
    if (normalizerOptions.stripSpaces) {
        sql = sql.replace(/\s/g, '');
    }
    if (normalizerOptions.stripQuotes) {
        sql = sql.replace(/['"]/g, '');
    }
    if (normalizerOptions.stripSpaces || normalizerOptions.stripQuotes) {
        return sql;
    }
    return sql.replace(/\s+/g, ' ').replace(/\(\s+?/g, '(').replace(/\s+?\)/g, ')');
}

export function formatSql(sql, formattingOptions) {
    if (formattingOptions.prettyPrint) {
        const ln = (depth = 2) => `\n${'\t'.repeat(depth + formattingOptions.indentation)}`;
        return `\n${sql}\n`.replace(/\n/g, ln());
    }
    return sql;
}
