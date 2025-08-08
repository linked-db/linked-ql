import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { TokenStream } from '../src/lang/TokenStream.js';
use(chaiAsPromised);

// --- Test Helpers ---

/**
 * Helper to create a TokenStream from a string for easy testing.
 * @param {string} input - The SQL string to tokenize.
 * @param {object} options - Options for the TokenStream.
 * @returns {Promise<TokenStream>} A promise that resolves to the initialized TokenStream.
 */
async function createStreamFromString(input, options = {}) {
    return TokenStream.create(input, { spaces: true, ...options });
}

/**
 * Helper to collect all tokens from a stream until it's exhausted.
 * @param {TokenStream} stream - The TokenStream instance.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of collected tokens.
 */
async function collectTokens(stream) {
    const tokens = [];
    let result;
    while (!(result = await stream.next()).done) {
        tokens.push(result.value);
    }
    return tokens;
}

// --- Test Suites ---

describe('TokenStream - Basic Tokenization & Stream Control', () => {

    it('should tokenize a simple SELECT statement with correct types and positions', async () => {
        const stream = await createStreamFromString('SELECT id FROM users;');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'keyword', value: 'SELECT', line: 1, column: 1 },
            { type: 'identifier', value: 'id', spaceBefore: ' ', line: 1, column: 8 },
            { type: 'keyword', value: 'FROM', spaceBefore: ' ', line: 1, column: 11 },
            { type: 'identifier', value: 'users', spaceBefore: ' ', line: 1, column: 16 },
            { type: 'punctuation', value: ';', line: 1, column: 21 },
        ]);
    });

    it('should correctly handle leading, trailing, and multiple spaces', async () => {
        const stream = await createStreamFromString('  SELECT  1   ;');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'keyword', value: 'SELECT', spaceBefore: '  ', line: 1, column: 3 },
            { type: 'number_literal', value: '1', spaceBefore: '  ', line: 1, column: 11 },
            { type: 'punctuation', value: ';', spaceBefore: '   ', line: 1, column: 15 },
        ]);
    });

    it('should correctly track line and column numbers across newlines', async () => {
        const stream = await createStreamFromString('SELECT\nid\nFROM x;');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ value: t.value, line: t.line, column: t.column }))).to.deep.equal([
            { value: 'SELECT', line: 1, column: 1 },
            { value: 'id', line: 2, column: 1 },
            { value: 'FROM', line: 3, column: 1 },
            { value: 'x', line: 3, column: 6 },
            { value: ';', line: 3, column: 7 },
        ]);
    });

    it('should return an empty array for empty input', async () => {
        const stream = await createStreamFromString('');
        const tokens = await collectTokens(stream);
        expect(tokens).to.be.empty;
    });

    it('should return an empty array for input consisting only of whitespace', async () => {
        const stream = await createStreamFromString('   \n\t  ');
        const tokens = await collectTokens(stream);
        expect(tokens).to.be.empty;
    });
});

describe('TokenStream - Literals', () => {

    it('should tokenize single-quoted string literals', async () => {
        const stream = await createStreamFromString("'hello world'");
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'string_literal', value: 'hello world', delim: "'", line: 1, column: 1 }
        ]);
    });

    it('should correctly handle escaped single quotes within strings', async () => {
        const stream = await createStreamFromString("'it''s a test'");
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'string_literal', value: "it's a test", delim: "'", line: 1, column: 1 }
        ]);
    });

    it('should handle backslash escaped characters in Postgres E-modifier strings', async () => {
        const stream = await createStreamFromString("E'hello\\nworld'", { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'string_literal', value: "hello\nworld", modifier: "E", delim: "'", line: 1, column: 1 }
        ]);
    });

    it('should tokenize integer number literals', async () => {
        const stream = await createStreamFromString('12345');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'number_literal', value: '12345', line: 1, column: 1 }
        ]);
    });

    it('should tokenize floating-point number literals', async () => {
        const stream = await createStreamFromString('12.345');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'number_literal', value: '12.345', line: 1, column: 1 }
        ]);
    });

    it('should tokenize floating-point numbers starting with a decimal point', async () => {
        const stream = await createStreamFromString('.5');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'number_literal', value: '.5', line: 1, column: 1 }
        ]);
    });

    it('should tokenize numbers with scientific notation', async () => {
        const stream = await createStreamFromString('1.23e+5');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'number_literal', value: '1.23e+5', line: 1, column: 1 }
        ]);
    });

    it('should tokenize HEX literals (X modifier) in MySQL', async () => {
        const stream = await createStreamFromString("X'DEADBEEF'", { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'hex_literal', value: 'DEADBEEF', delim: "'", line: 1, column: 1 }
        ]);
    });

    it('should tokenize BINARY literals (B modifier) in Postgres', async () => {
        const stream = await createStreamFromString("B'10110'", { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'bit_literal', value: '10110', delim: "'", line: 1, column: 1 }
        ]);
    });

    it('should tokenize boolean TRUE and FALSE keywords', async () => {
        const stream = await createStreamFromString('TRUE FALSE');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'bool_literal', value: 'TRUE', line: 1, column: 1 },
            { type: 'bool_literal', value: 'FALSE', spaceBefore: ' ', line: 1, column: 6 },
        ]);
    });

    it('should tokenize NULL literal', async () => {
        const stream = await createStreamFromString('NULL');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'null_literal', value: 'NULL', line: 1, column: 1 }
        ]);
    });

    it('should correctly tokenize 0x prefixed hex literals in MySQL', async () => {
        const stream = await createStreamFromString('0x1A', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'hex_literal', value: '1A', line: 1, column: 1 }
        ]);
    });
});

describe('TokenStream - Identifiers', () => {

    it('should tokenize unquoted identifiers', async () => {
        const stream = await createStreamFromString('my_table');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'my_table', line: 1, column: 1 }
        ]);
    });

    it('should tokenize double-quoted identifiers (Postgres default)', async () => {
        const stream = await createStreamFromString('"column_name"', { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'column_name', delim: '"', line: 1, column: 1 }
        ]);
    });

    it('should handle escaped double-quotes in quoted identifiers', async () => {
        const stream = await createStreamFromString('"""quoted""id"""', { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: '"quoted"id"', delim: '"', line: 1, column: 1 }
        ]);
    });

    it('should tokenize backtick-quoted identifiers (MySQL)', async () => {
        const stream = await createStreamFromString('`my_column`', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'my_column', delim: '`', line: 1, column: 1 }
        ]);
    });

    it('should treat double quotes as strings in MySQL by default', async () => {
        const stream = await createStreamFromString('"hello"', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'string_literal', value: 'hello', delim: '"', line: 1, column: 1 }
        ]);
    });

    it('should treat double quotes as identifiers in MySQL with ansi_quotes option enabled', async () => {
        const stream = await createStreamFromString('"hello"', { dialect: 'mysql', mysqlAnsiQuotes: true });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'hello', delim: '"', line: 1, column: 1 }
        ]);
    });
});

describe('TokenStream - Comments', () => {

    it('should tokenize multi-line block comments (/* */) when comments option is true', async () => {
        const stream = await createStreamFromString('/* This is a\n * multi-line\n * comment */ SELECT 1;', { comments: true });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'block_comment', value: 'This is a\nmulti-line\ncomment', line: 1, column: 1 },
            { type: 'keyword', value: 'SELECT', spaceBefore: ' ', line: 3, column: 15 },
            { type: 'number_literal', value: '1', spaceBefore: ' ', line: 3, column: 22 },
            { type: 'punctuation', value: ';', line: 3, column: 23 },
        ]);
    });

    it('should tokenize single-line comments (--) when comments option is true', async () => {
        const stream = await createStreamFromString('-- A comment\nSELECT 1;', { comments: true });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'line_comment', value: 'A comment', delim: '--', line: 1, column: 1 },
            { type: 'keyword', value: 'SELECT', spaceBefore: '\n', line: 2, column: 1 },
            { type: 'number_literal', value: '1', spaceBefore: ' ', line: 2, column: 8 },
            { type: 'punctuation', value: ';', line: 2, column: 9 },
        ]);
    });

    it('should tokenize MySQL single-line comments (#) when comments option is true', async () => {
        const stream = await createStreamFromString('# A comment\nSELECT 1;', { dialect: 'mysql', comments: true });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'line_comment', value: 'A comment', delim: '#', line: 1, column: 1 },
            { type: 'keyword', value: 'SELECT', spaceBefore: '\n', line: 2, column: 1 },
            { type: 'number_literal', value: '1', spaceBefore: ' ', line: 2, column: 8 },
            { type: 'punctuation', value: ';', line: 2, column: 9 },
        ]);
    });

    it('should skip comments if options.comments is false', async () => {
        const stream = await createStreamFromString('-- A comment\nSELECT 1;', { comments: false });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'keyword', value: 'SELECT', spaceBefore: '\n', line: 2, column: 1 },
            { type: 'number_literal', value: '1', spaceBefore: ' ', line: 2, column: 8 },
            { type: 'punctuation', value: ';', line: 2, column: 9 },
        ]);
    });
});

describe('TokenStream - Operators & Punctuation', () => {

    it('should tokenize single-character arithmetic and comparison operators', async () => {
        const stream = await createStreamFromString('1 + 2 * 3 / 4 - 5 = 6 > 7 < 8');
        const tokens = await collectTokens(stream);
        const operators = tokens.filter(t => t.type === 'operator').map(t => t.value);
        expect(operators).to.deep.equal(['+', '*', '/', '-', '=', '>', '<']);
    });

    it('should tokenize multi-character operators (e.g., ||, <=, >=, !=, <>)', async () => {
        const stream = await createStreamFromString('a || b AND c <= d OR e >= f WHERE g != h AND i <> j');
        const tokens = await collectTokens(stream);
        // Corrected expectation: filter for only operators and keywords
        expect(tokens.filter(t => t.type === 'operator' || t.type === 'keyword').map(t => t.value)).to.deep.equal([
            '||', 'AND', '<=', 'OR', '>=', 'WHERE', '!=', 'AND', '<>'
        ]);
    });

    it('should tokenize bitwise operators (&, |, ^, <<, >>)', async () => {
        const stream = await createStreamFromString('a & b | c ^ d << e >> f');
        const tokens = await collectTokens(stream);
        expect(tokens.filter(t => t.type === 'operator' || t.type === 'identifier').map(t => t.value)).to.deep.equal([
            'a', '&', 'b', '|', 'c', '^', 'd', '<<', 'e', '>>', 'f',
        ]);
    });

    it('should tokenize the Postgres type cast operator (::)', async () => {
        const stream = await createStreamFromString('field::text');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'identifier', value: 'field' },
            { type: 'operator', value: '::' },
            { type: 'data_type', value: 'TEXT' }
        ]);
    });

    it('should tokenize JSON operators (->, ->>) in Postgres', async () => {
        const stream = await createStreamFromString('data->key data->>value', { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'identifier', value: 'data' },
            { type: 'operator', value: '->' },
            { type: 'keyword', value: 'KEY' },
            { type: 'identifier', value: 'data' },
            { type: 'operator', value: '->>' },
            { type: 'identifier', value: 'value' },
        ]);
    });

    it('should correctly tokenize multiple operators consecutively (e.g., ++)', async () => {
        const stream = await createStreamFromString('10++5');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'number_literal', value: '10' },
            { type: 'operator', value: '+' },
            { type: 'operator', value: '+' },
            { type: 'number_literal', value: '5' },
        ]);
    });

    it('should correctly tokenize operators adjacent to punctuation or other tokens', async () => {
        const stream = await createStreamFromString('(col+1)/2');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'punctuation', value: '(' },
            { type: 'identifier', value: 'col' },
            { type: 'operator', value: '+' },
            { type: 'number_literal', value: '1' },
            { type: 'punctuation', value: ')' },
            { type: 'operator', value: '/' },
            { type: 'number_literal', value: '2' },
        ]);
    });

    it('should tokenize common punctuation marks', async () => {
        const stream = await createStreamFromString('func(arg1, arg2); {key:val}[0].field');
        const tokens = await collectTokens(stream);
        const punctuations = tokens.filter(t => t.type === 'punctuation').map(t => t.value);
        expect(punctuations).to.deep.equal(['(', ',', ')', ';', '{', ':', '}', '[', ']', '.']);
    });
});

describe('TokenStream - Keywords & Multi-word Tokens', () => {

    it('should tokenize single-word keywords', async () => {
        const stream = await createStreamFromString('SELECT FROM WHERE');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.value)).to.deep.equal(['SELECT', 'FROM', 'WHERE']);
        expect(tokens.every(t => t.type === 'keyword')).to.be.true;
    });

    it('should tokenize multi-word keywords like "GROUP BY"', async () => {
        const stream = await createStreamFromString('GROUP BY id');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'keyword', value: 'GROUP', line: 1, column: 1 },
            { type: 'keyword', value: 'BY', spaceBefore: ' ', line: 1, column: 7 },
            { type: 'identifier', value: 'id', spaceBefore: ' ', line: 1, column: 10 }
        ]);
    });

    it('should tokenize multi-word operators like "IS NOT"', async () => {
        const stream = await createStreamFromString('col IS NOT NULL');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'col', line: 1, column: 1 },
            { type: 'operator', value: 'IS NOT', resultType: 'boolean', spaceBefore: ' ', line: 1, column: 5, prec: 50, assoc: 'left' },
            { type: 'null_literal', value: 'NULL', spaceBefore: ' ', line: 1, column: 12 },
        ]);
    });

    it('should distinguish keywords from identifiers with a common prefix (e.g., ORDER vs ORDERING)', async () => {
        const stream = await createStreamFromString('ORDERING');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'ORDERING', line: 1, column: 1 }
        ]);
    });

    it('should handle complex multi-word statements (e.g., CREATE TABLE)', async () => {
        const stream = await createStreamFromString('CREATE TABLE my_table;');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'keyword', value: 'CREATE', line: 1, column: 1 },
            { type: 'keyword', value: 'TABLE', spaceBefore: ' ', line: 1, column: 8 },
            { type: 'identifier', value: 'my_table', spaceBefore: ' ', line: 1, column: 14 },
            { type: 'punctuation', value: ';', line: 1, column: 22 },
        ]);
    });
});

describe('TokenStream - Bindings & Variables', () => {

    it('should tokenize Postgres positional bindings ($1, $2)', async () => {
        const stream = await createStreamFromString('SELECT $1 FROM tbl WHERE col = $2', { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        const bindings = tokens.filter(t => t.type === 'bind_var');
        expect(bindings).to.deep.equal([
            { type: 'bind_var', value: '1', spaceBefore: ' ', line: 1, column: 8 },
            { type: 'bind_var', value: '2', spaceBefore: ' ', line: 1, column: 32 },
        ]);
    });

    it('should tokenize Postgres dollar-quoted strings ($tag$string$tag$)', async () => {
        const stream = await createStreamFromString('$$my string content$$', { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'string_literal', value: 'my string content', delim: '$$', line: 1, column: 1 }
        ]);
    });

    it('should tokenize MySQL positional bindings (?) and re-index them', async () => {
        const stream = await createStreamFromString('INSERT INTO tbl VALUES (?, ?)', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        const bindings = tokens.filter(t => t.type === 'bind_var');
        expect(bindings).to.deep.equal([
            { type: 'bind_var', value: '1', line: 1, column: 25 },
            { type: 'bind_var', value: '2', spaceBefore: ' ', line: 1, column: 28 },
        ]);
    });

    it('should tokenize MySQL user variables (@var)', async () => {
        const stream = await createStreamFromString('SELECT @my_var := 1', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        const variables = tokens.filter(t => t.type === 'user_var');
        expect(variables).to.deep.equal([
            { type: 'user_var', value: 'my_var', spaceBefore: ' ', line: 1, column: 8 }
        ]);
    });

    it('should tokenize MySQL system variables (@@sysvar)', async () => {
        const stream = await createStreamFromString('SELECT @@session.autocommit', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        const variables = tokens.filter(t => t.type === 'system_var');
        expect(variables).to.deep.equal([
            { type: 'system_var', value: 'session.autocommit', spaceBefore: ' ', line: 1, column: 8 }
        ]);
    });

    it('should tokenize PL/SQL variables (:var) in Postgres', async () => {
        const stream = await createStreamFromString('BEGIN :my_pl_var := 1; END;', { dialect: 'postgres' });
        const tokens = await collectTokens(stream);
        const variables = tokens.filter(t => t.type === 'user_var');
        expect(variables).to.deep.equal([
            { type: 'user_var', value: 'my_pl_var', spaceBefore: ' ', line: 1, column: 7 }
        ]);
    });
});

describe('TokenStream - Stream Management (peek, next, eat, expect)', () => {

    let stream;
    beforeEach(async () => {
        stream = await createStreamFromString('A B C D E');
        await stream.next(); // Initialize stream so 'current' is 'A'
    });

    it('peek() should return token without consuming it', async () => {
        expect(stream.current().value).to.equal('A');
        expect((await stream.peek(1)).value).to.equal('B');
        expect(stream.current().value).to.equal('A'); // current should still be A
    });

    it('peek() should support multiple lookahead steps', async () => {
        expect((await stream.peek(2)).value).to.equal('C');
        expect((await stream.peek(1)).value).to.equal('B'); // should still be peekable
        await stream.next(); // current is now B
        expect((await stream.peek(1)).value).to.equal('C');
    });

    it('eat() should consume token if type/value match, otherwise not advance', async () => {
        expect(stream.current().value).to.equal('A');
        const eaten = await stream.eat('identifier', 'A');

        expect(eaten).to.be.an('object');
        expect(eaten.value).to.equal('A');
        expect(stream.current().value).to.equal('B'); // should have advanced

        const notEaten = await stream.eat('number_literal');
        expect(notEaten).to.be.undefined; // Should be null/undefined
        expect(stream.current().value).to.equal('B'); // should not have advanced
    });

    it('expect() should consume token if match, and throw an error if no match', async () => {
        expect(stream.current().value).to.equal('A');
        const expected = await stream.expect('identifier', 'A');
        expect(expected).to.be.an('object');
        expect(expected.value).to.equal('A');
        expect(stream.current().value).to.equal('B'); // Should be 'B'

        // Prepare a new stream for the failing test case
        const failingStream = await createStreamFromString('X Y');
        await failingStream.next(); // current is X
        await expect(failingStream.expect('number_literal')).to.eventually.be.rejectedWith('Expected token: number_literal');
    });
});

describe('TokenStream - Savepoint, Restore, Commit', () => {

    let stream;
    beforeEach(async () => {
        stream = await createStreamFromString('A B C D E');
        await stream.next(); // Initialize current to 'A'
    });

    it('should restore the stream to a previously saved point', async () => {
        await stream.next(); // current B

        const sp1 = stream.savepoint(); // Save at B

        await stream.next(); // current C
        await stream.next(); // current D

        stream.restore(sp1); // Restore to B

        expect(stream.current().value).to.equal('B');
        await stream.next();
        expect(stream.current().value).to.equal('C'); // Should continue from C
    });

    it('should commit a savepoint, making changes permanent and clearing the savepoint', async () => {
        const sp1 = stream.savepoint(); // Save at A

        await stream.next(); // current B
        await stream.next(); // current C

        stream.commit(sp1); // Commit B and C

        expect(stream.current().value).to.equal('C');
        await stream.next();
        expect(stream.current().value).to.equal('D'); // Should continue from D
        expect(stream.savepointStatus()).to.be.null;
    });

    it('should correctly handle nested savepoints with restore operations', async () => {
        const sp1 = stream.savepoint(); // sp1 at A
        await stream.next(); // B

        const sp2 = stream.savepoint(); // sp2 at B
        await stream.next(); // C

        stream.restore(sp2); // restore to B
        expect(stream.current().value).to.equal('B');
        await stream.next(); // C
        expect(stream.current().value).to.equal('C');

        stream.restore(sp1); // restore to A
        expect(stream.current().value).to.equal('A');
        await stream.next(); // B
        expect(stream.current().value).to.equal('B');
    });

    it('should throw an error when attempting to restore to an invalid savepoint ID', async () => {
        stream.savepoint(); // Create at least one valid savepoint
        expect(() => stream.restore(999)).to.throw('Invalid restore point 999');
    });
});

describe('TokenStream - Block Tokenization (structured mode)', () => {

    it('should tokenize simple parentheses as a nested TokenStream block', async () => {
        const stream = await createStreamFromString('(1 + 2)', { structured: true });
        const tokens = await collectTokens(stream);

        expect(tokens.length).to.equal(1);
        const blockToken = tokens[0];
        expect(blockToken.type).to.equal('paren_block');
        expect(blockToken.value).to.be.an.instanceOf(TokenStream);

        const innerTokens = await collectTokens(blockToken.value);
        expect(innerTokens.map((t) => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'number_literal', value: '1' },
            { type: 'operator', value: '+' },
            { type: 'number_literal', value: '2' },
        ]);

        // Ensure the parent stream is at the end after the block is fully consumed
        const parentRemainingTokens = await collectTokens(stream);
        expect(parentRemainingTokens).to.be.empty;
    });

    it('should correctly handle nested blocks within parentheses', async () => {
        const stream = await createStreamFromString('((A))', { structured: true });
        const tokens = await collectTokens(stream);

        const outerBlock = tokens[0];
        expect(outerBlock.type).to.equal('paren_block');

        const innerTokens = await collectTokens(outerBlock.value);
        expect(innerTokens.length).to.equal(1);
        const innerBlock = innerTokens[0];
        expect(innerBlock.type).to.equal('paren_block');

        const innermostTokens = await collectTokens(innerBlock.value);
        expect(innermostTokens).to.deep.equal([
            { type: 'identifier', value: 'A', line: 1, column: 3 }
        ]);

        const parentRemainingTokens = await collectTokens(stream);
        expect(parentRemainingTokens).to.be.empty;
    });

    it('should lock inner streams to prevent external operations during peek', async () => {
        const stream = await createStreamFromString('(1 + 2)', { structured: true });
        expect(stream.locked).to.be.false;

        let firstToken = await stream.peek(1); // Peeking a block token locks its inner stream
        expect(firstToken.value.locked).to.be.true;

        // Attempting operations on a locked inner stream should throw
        expect(() => firstToken.value.savepoint()).to.throw('Can\'t execute savepoint(); TokenStream is locked');
        await expect(firstToken.value.next()).to.eventually.be.rejectedWith('Can\'t execute next(); TokenStream is locked');

        // After consuming the block token from the parent stream, the inner stream should be unlocked
        firstToken = (await stream.next()).value;
        expect(firstToken.value.locked).to.be.false;

        const remainingTokens = await collectTokens(stream);
        expect(remainingTokens).to.be.empty;
    });

    it('should correctly handle blocks with comments and whitespace inside', async () => {
        const stream = await createStreamFromString('( /* c1 */ A -- c2\n )', { structured: true, comments: true });
        const tokens = await collectTokens(stream);

        const blockToken = tokens[0];
        const innerTokens = await collectTokens(blockToken.value);

        expect(innerTokens).to.deep.equal([
            { type: 'block_comment', value: 'c1', spaceBefore: ' ', line: 1, column: 3 },
            { type: 'identifier', value: 'A', spaceBefore: ' ', line: 1, column: 12 },
            { type: 'line_comment', value: 'c2', delim: '--', spaceBefore: ' ', line: 1, column: 14 },
        ]);
    });
});

describe('TokenStream - Error Handling', () => {

    it('should throw an error for an unterminated string literal', async () => {
        const stream = await createStreamFromString("'hello");
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unterminated string_literal at line 1, column \d+/);
    });

    it('should throw an error for an unterminated block (e.g., unclosed parenthesis)', async () => {
        const stream = await createStreamFromString('({', { structured: true });
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unterminated nesting "\{" at line 1, column \d+/);
    });

    it('should throw an error for unexpected characters within a numeric literal (MySQL hex)', async () => {
        const stream = await createStreamFromString("X'12G'", { dialect: 'mysql' });
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unexpected token: G at line 1, column \d+/);
    });

    it('should throw an error for an invalid number format (e.g., multiple decimal points)', async () => {
        const stream = await createStreamFromString("12.3.4");
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unexpected token: \. at line 1, column \d+/);
    });

    it('should throw an error for an unterminated multi-line comment', async () => {
        const stream = await createStreamFromString('/* comment', { comments: true });
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unterminated block_comment at line 1, column \d+/);
    });

    it('should throw an error for an incomplete token at EOF (e.g., dangling operator)', async () => {
        const stream = await createStreamFromString('SELECT 1 +', { dialect: 'postgres' });
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unterminated operator at line 1, column \d+/);
    });
});

describe('TokenStream - Async Iteration and Chunking', () => {
    // A simple async iterator that yields chunks
    async function* createAsyncGenerator(inputChunks) {
        for (const chunk of inputChunks) {
            yield chunk;
            // Simulate async delay to ensure async behavior is tested
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }

    it('should correctly tokenize input from an async generator', async () => {
        const chunks = ['SELECT', ' id ', 'FROM', ' users;'];
        const stream = await TokenStream.create(createAsyncGenerator(chunks));
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.value)).to.deep.equal(['SELECT', 'id', 'FROM', 'users', ';']);
    });

    it('should handle tokens split across multiple async chunks', async () => {
        const chunks = ['SEL', 'ECT ', 'id', ' FROM ', 'users;'];
        const stream = await TokenStream.create(createAsyncGenerator(chunks));
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.value)).to.deep.equal(['SELECT', 'id', 'FROM', 'users', ';']);
    });

    it('should handle multi-word tokens split across async chunks', async () => {
        const chunks = ['GROU', 'P BY', ' id'];
        const stream = await TokenStream.create(createAsyncGenerator(chunks));
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.value)).to.deep.equal(['GROUP', 'BY', 'id']);
    });

    it('should handle comments split across async chunks', async () => {
        const chunks = ['/*', ' multi-line ', 'comment */', 'SELECT'];
        const stream = await TokenStream.create(createAsyncGenerator(chunks), { comments: true });
        const tokens = await collectTokens(stream);
        expect(tokens[0].value).to.equal('multi-line comment'); // Check the value of the comment token
        expect(tokens.map(t => t.value)).to.deep.equal(['multi-line comment', 'SELECT']);
    });

    it('should handle string literals split across async chunks', async () => {
        const chunks = ["'", "hello", " world", "'"];
        const stream = await TokenStream.create(createAsyncGenerator(chunks));
        const tokens = await collectTokens(stream);
        expect(tokens[0].value).to.equal('hello world');
        expect(tokens[0].type).to.equal('string_literal');
    });
});

describe('TokenStream - LinkedQL Version Tags (Unquoted)', () => {

    it('should tokenize basic LinkedQL version tag (my_db@1_3)', async () => {
        const stream = await createStreamFromString('my_db@1_3');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'my_db', line: 1, column: 1 },
            { type: 'version_spec', value: '1_3', line: 1, column: 6 },
        ]);
    });

    it('should tokenize LinkedQL version tags with carets (^) and tildes (~)', async () => {
        const stream = await createStreamFromString('my_app@^2_1 my_lib@~7_6');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'my_app', line: 1, column: 1 },
            { type: 'version_spec', value: '^2_1', line: 1, column: 7 },
            { type: 'identifier', value: 'my_lib', spaceBefore: ' ', line: 1, column: 13 },
            { type: 'version_spec', value: '~7_6', line: 1, column: 19 },
        ]);
    });

    it('should tokenize LinkedQL version tags with equality and comparison operators', async () => {
        const stream = await createStreamFromString('db@=3_4 db@<3 db@>4 db@<=3 db@>=4');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'identifier', value: 'db' },
            { type: 'version_spec', value: '=3_4' },
            { type: 'identifier', value: 'db' },
            { type: 'version_spec', value: '<3' },
            { type: 'identifier', value: 'db' },
            { type: 'version_spec', value: '>4' },
            { type: 'identifier', value: 'db' },
            { type: 'version_spec', value: '<=3' },
            { type: 'identifier', value: 'db' },
            { type: 'version_spec', value: '>=4' },
        ]);
    });

    it('should tokenize LinkedQL version tags with space before @ and include @ in spaceBefore', async () => {
        const stream = await createStreamFromString('my_db @1_2');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'my_db', line: 1, column: 1 },
            { type: 'version_spec', value: '1_2', spaceBefore: ' ', line: 1, column: 7 }
        ]);
    });

    it('should correctly handle @ as an operator in other dialects (e.g., MySQL) when not a version tag', async () => {
        const stream = await createStreamFromString('tbl @ column', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.type)).to.deep.equal(['identifier', 'operator', 'keyword']);
    });

    it('should prioritize LinkedQL version tag over MySQL user variable syntax for @', async () => {
        const stream = await createStreamFromString('SELECT my_db@1_2', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.type)).to.deep.equal(['keyword', 'identifier', 'version_spec']);
        expect(tokens[2].value).to.equal('1_2');
    });

    it('should throw error for malformed version tag (non-digit after underscore)', async () => {
        const stream = await createStreamFromString('my_db@1_A');
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unexpected token: A at line \d+, column \d+/);
    });

    it('should throw error for malformed version tag (multiple comparison operators)', async () => {
        const stream = await createStreamFromString('my_db@==1');
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unexpected token: = at line \d+, column \d+/);
    });

    it('should correctly handle non-version tag sequences without a number/operator after @', async () => {
        const stream = await createStreamFromString('my_db@abc'); // 'abc' is not a valid version start
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'identifier', value: 'my_db' },
            { type: 'operator', value: '@' },
            { type: 'identifier', value: 'abc' },
        ]);
    });

    it('should not tokenize @ as version tag if preceding token is not an identifier', async () => {
        const stream = await createStreamFromString('123@1'); // Number followed by @
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.type)).to.deep.equal(['number_literal', 'operator', 'number_literal']);
        expect(tokens[1].value).to.equal('@');
    });
});

describe('TokenStream - LinkedQL Quoted Version Tags', () => {

    it('should tokenize basic LinkedQL quoted version tag (my_db@\'1_3\')', async () => {
        const stream = await createStreamFromString('my_db@\'1_3\'');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'my_db', line: 1, column: 1 },
            { type: 'version_spec', value: '1_3', delim: "'", line: 1, column: 6 },
        ]);
    });

    it('should tokenize LinkedQL quoted version tags with carets (^) and tildes (~)', async () => {
        const stream = await createStreamFromString('my_app@\'^2_1\' my_lib@\'~7_6\'');
        const tokens = await collectTokens(stream);
        expect(tokens).to.deep.equal([
            { type: 'identifier', value: 'my_app', line: 1, column: 1 },
            { type: 'version_spec', value: '^2_1', delim: "'", line: 1, column: 7 },
            { type: 'identifier', value: 'my_lib', spaceBefore: ' ', line: 1, column: 15 },
            { type: 'version_spec', value: '~7_6', delim: "'", line: 1, column: 21 },
        ]);
    });

    it('should tokenize LinkedQL quoted version tags with equality and comparison operators', async () => {
        const stream = await createStreamFromString('db@\'=3_4\' db@\'<3\' db@\'>4\' db@\'<=3\' db@\'>=4\'');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value, delim: t.delim }))).to.deep.equal([
            { type: 'identifier', value: 'db', delim: undefined },
            { type: 'version_spec', value: '=3_4', delim: "'" },
            { type: 'identifier', value: 'db', delim: undefined },
            { type: 'version_spec', value: '<3', delim: "'" },
            { type: 'identifier', value: 'db', delim: undefined },
            { type: 'version_spec', value: '>4', delim: "'" },
            { type: 'identifier', value: 'db', delim: undefined, },
            { type: 'version_spec', value: '<=3', delim: "'" },
            { type: 'identifier', value: 'db', delim: undefined },
            { type: 'version_spec', value: '>=4', delim: "'" },
        ]);
    });

    it('should not tokenize @ \'...\' as a version tag if there is a space between @ and the opening quote', async () => {
        const stream = await createStreamFromString('my_db @ \'1_2\'');
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => ({ type: t.type, value: t.value }))).to.deep.equal([
            { type: 'identifier', value: 'my_db' },
            { type: 'operator', value: '@' },
            { type: 'string_literal', value: '1_2' }
        ]);
    });

    it('should correctly handle @\'...\' as a version tag even in MySQL dialect context', async () => {
        const stream = await createStreamFromString('SELECT my_db@\'2_0\'', { dialect: 'mysql' });
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.type)).to.deep.equal(['keyword', 'identifier', 'version_spec']);
        expect(tokens[2].value).to.equal('2_0');
        expect(tokens[2].delim).to.equal("'");
    });

    it('should throw error for malformed quoted version tag (non-digit after underscore)', async () => {
        const stream = await createStreamFromString('my_db@\'1_A\'');
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unexpected token: A at line \d+, column \d+/);
    });

    it('should throw error for malformed quoted version tag (multiple comparison operators)', async () => {
        const stream = await createStreamFromString('my_db@\'==1\'');
        await expect(collectTokens(stream)).to.be.rejectedWith(/Unexpected token: = at line \d+, column \d+/);
    });

    it('should not tokenize @\'...\' as version tag if preceding token is not an identifier', async () => {
        const stream = await createStreamFromString('123 @\'1_2\''); // Number followed by @'...'
        const tokens = await collectTokens(stream);
        expect(tokens.map(t => t.type)).to.deep.equal(['number_literal', 'operator', 'string_literal']);
        expect(tokens[1].value).to.equal('@');
        expect(tokens[2].value).to.equal('1_2');
        expect(tokens[2].delim).to.equal("'");
    });
});
