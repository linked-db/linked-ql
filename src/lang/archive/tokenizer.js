// Tokenizer
class Tokenizer {
    constructor(tokenStream) {
        this.tokenStream = tokenStream;
        this.current = null;
        this.lookahead = [];
    }

    [Symbol.asyncIterator]() {
        return this.tokenStream[Symbol.asyncIterator]();
    }

    async next() {
        if (this.lookahead.length) {
            this.current = this.lookahead.shift();
        } else {
            this.current = await this.tokenStream.next();
        }
        return this.current;
    }

    async peek(offset = 0) {
        while (this.lookahead.length <= offset) {
            const next = await this.tokenStream.next();
            if (next.done) break;
            this.lookahead.push(next);
        }
        return this.lookahead[offset];
    }

    static async tokenize(input, options = {}, state = null) {
        const Tokenizer = this;
        return new Tokenizer(
            await tokenize(toStream(input), options, state)
        );
        // toStream() helper
        function toStream(input) {
            if (typeof input[Symbol.asyncIterator] === 'function') {
                return typeof input.next === 'function' ? input : input[Symbol.asyncIterator]();
            }
            if (typeof input[Symbol.iterator] === 'function' && typeof input !== 'string' && !(input instanceof String)) {
                return typeof input.next === 'function' ? input : input[Symbol.iterator]();
            }
            return (function* () { yield input + ''; })();
        }
        // Main tokenizer function
        async function* tokenize(stream, options = {}, state = null) {
            // Create state
            state = state || {
                buffer: '',
                cursor: 0,
                line: 1,
                column: 1,
                next(by = 1, isLf = false) {
                    if (isLf) {
                        this.line++;
                        this.column = 1;
                    }
                    this.column += by;
                    this.cursor += by;
                },
                token: null,
                awaitingStream: '',
            };
            // Iterate over the input stream chunk by chunk
            let chunk = { value: '' };
            do {
                state.buffer += chunk.value || ''/*when done*/;
                let char;
                while (char = state.buffer[state.cursor]) {
                    const possiblyChunked = state.buffer[state.cursor + 1] === undefined && !chunk.done;
        
                    // -------------------------
                    // Variable contents/ending
                    // -------------------------
                    if (state.token?.type === 'variable') {
                        if (state.token.notation === '$' && !state.token.positional && char === '$') {
                            const { type: _, positional: __, notation: ___, value, ...token } = state.token;
                            state.token = { type: 'string', notation: `$${value}$`, value: '', ...token };
                            state.next();
                            continue;
                        }
                        if (/\w/.test(char)) {
                            state.token.value += char;
                            state.next();
                            continue;
                        }
                    }
        
                    // -------------------------
                    // Comment/string/identifier contents/ending
                    // -------------------------
                    if (['comment', 'string'].includes(state.token?.type) || (state.token?.type === 'identifier' && state.token.notation)) {
                        let tokenEnd;
                        if (state.token.type === 'comment') {
                            if (state.token.notation === '/*' && char === '*') {
                                if (possiblyChunked) break; // We need to look ahead to know if this is comment ending
                                tokenEnd = state.buffer[state.cursor + 1] === '/' && 2;
                            } else {
                                tokenEnd = ((state.token.notation === '--' || state.token.notation === '#') && char === '\n') && 1;
                            }
                        } else if (state.token.type === 'string' || state.token.type === 'identifier') {
                            if (char === state.token.notation) {
                                if (options.ansi && (char === "'" || char === '"')) {
                                    if (possiblyChunked) break; // We need to look ahead to know if this is an ansi-mode escape char
                                    if (state.buffer[state.cursor + 1] === char) {
                                        state.token.value += char; // Pick one of the two quotes
                                        state.next(2);
                                        continue;
                                    }
                                }
                                tokenEnd = 1;
                            } else if (state.token.type === 'string' && state.token.notation.startsWith('$') && char === '$') {
                                const cursor = state.cursor + 1;
                                if (state.buffer.slice(cursor - state.token.notation.length, cursor) === state.token.notation) {
                                    state.token.value = state.token.value.slice(0, - state.token.notation.length + 1);
                                    tokenEnd = 1;
                                }
                            } else if (char === '\\' && !options.ansi) {
                                if (possiblyChunked) break; // We need to look ahead to know if this is non-ansi escape char
                                if (state.buffer[state.cursor + 1] === '"' || state.buffer[state.cursor + 1] === "'") {
                                    state.token.value += state.buffer[state.cursor + 1];
                                    state.next(2);
                                    continue;
                                }
                            }
                        }
                        if (tokenEnd) {
                            yield state.token;
                            state.token = null;
                            state.next(tokenEnd);
                            continue;
                        }
                        // Eat token
                        state.token.value += char;
                        state.next();
                        continue;
                    }
        
                    // -------------------------
                    // Comment/string/identifier starting: --, /*, #
                    // -------------------------
                    let tokenStart;
        
                    if (char === '$') {
                        if (possiblyChunked) break; // We need to look ahead to know if this is positional variable
                        tokenStart = { type: 'variable', notation: char, positional: /[0-9]/.test(state.buffer[state.cursor + 1]) };
                    } else if (char === '@') {
                        if (possiblyChunked) break; // We need to look ahead to properly determine if variable
                        if (state.buffer[state.cursor + 1] === '@') {
                            // MySQL system variables
                            tokenStart = { type: 'variable', notation: char + char };
                        } else if (/\w/.test(state.buffer[state.cursor + 1])) {
                            // MySQL user-defined variables
                            tokenStart = { type: 'variable', notation: char };
                        }
                    } else if (char === '#') {
                        tokenStart = { type: 'comment', notation: char };
                    } else if (char === '-') {
                        if (possiblyChunked) break; // We need to look ahead to know if this is comment starting
                        if (state.buffer[state.cursor + 1] === '-') {
                            tokenStart = { type: 'comment', notation: char + '-' };
                        }
                    } else if (char === '/') {
                        if (possiblyChunked) break; // We need to look ahead to know if this is comment starting
                        if (state.buffer[state.cursor + 1] === '*') {
                            tokenStart = { type: 'comment', notation: char + '*' };
                        }
                    } else if (char === "'") {
                        tokenStart = { type: 'string', notation: char };
                    } else if (char === '"') {
                        tokenStart = { type: options.ansi ? 'identifier' : 'string', notation: char };
                    } else if (char === '`') {
                        tokenStart = { type: !options.ansi ? 'identifier' : 'unknown', notation: char };
                    }
        
                    // Start token
                    if (tokenStart) {
                        if (state.token) {
                            yield state.token;
                        }
                        state.token = { ...tokenStart, value: '', line: state.line, column: state.column };
                        state.next(tokenStart.notation.length);
                        continue;
                    }
        
                    // -------------------------
                    // Line breaks and whitespaces
                    // -------------------------
                    if (char === '\n' || char === ' ') {
                        if (state.buffer[state.cursor - 1] !== ' ' && state.token) {
                            yield state.token;
                            state.token = null;
                        }
                        if (char === '\n') {
                            state.next(1, true);
                        } else {
                            state.next();
                        }
                        continue;
                    }
        
                    // -------------------------
                    // Non-ansi-mode escaping
                    // -------------------------
                    if (char === '\\' && !options.ansi) {
                        if (possiblyChunked) break; // We need to look ahead to know if this is non-ansi escape char
                        if (state.buffer[state.cursor + 1] === '"' || state.buffer[state.cursor + 1] === "'") {
                            state.token.value += state.buffer[state.cursor + 1];
                            state.next(2);
                            continue;
                        }
                    }
        
                    // -------------------------
                    // Block starting: {, [, (
                    // -------------------------
                    if (char === '{' || char === '[' || char === '(') {
                        // When we encounter an opening block, we enter sub-tokenization
                        if (state.token) {
                            yield state.token;
                        }
                        state.token = null;
                        state.next();
                        const stopChar = { '{': '}', '[': ']', '(': ')' }[char];
                        yield {
                            type: 'block',
                            notation: char,
                            tokens: await Tokenizer.tokenize(stream, { ...options, stopChar }, state),
                        };
                        continue;
                    }
        
                    // Handle closing blocks like }, ], )
                    if (char === options.stopChar) {
                        if (state.token) {
                            yield state.token;
                        }
                        state.token = null;
                        state.next();
                        return;
                    }
        
                    // -------------------------
                    // Numbers, alphanumeric chars, operators
                    // -------------------------
                    if (/[0-9]/.test(char) || (state.token?.type === 'number' && char === '.')) {
                        if (state.token?.type !== 'number') {
                            if (state.token) {
                                yield state.token;
                            }
                            state.token = { type: 'number', value: char, line: state.line, column: state.column };
                            state.next();
                            continue;
                        }
                    } else if (/[a-zA-Z_]/.test(char)) {
                        if (state.token?.type !== 'identifier') {
                            if (state.token) {
                                yield state.token;
                            }
                            state.token = { type: 'identifier', value: char, line: state.line, column: state.column };
                            state.next();
                            continue;
                        }
                    } else {
                        // Handle operators
                        if (state.token?.type !== 'operator') {
                            if (state.token) {
                                yield state.token;
                            }
                            state.token = { type: 'operator', value: char, line: state.line, column: state.column };
                            state.next();
                            continue;
                        }
                    }
        
                    state.token.value += char;
                    state.next();
                }
        
                if (chunk.done) break;
                // Update buffer to handle overflow and continue from next chunk
                state.buffer = state.buffer.slice(state.cursor);
                state.cursor = 0;
            } while (chunk = await stream.next());
        
            if (state.token) {
                yield state.token;
            }
        }
    }
}

class Expression {

    #contextNode;
    #start;
    #end;

    constructor(contextNode) {
        this.#contextNode = contextNode;
    }

    setStart(pos) { this.#start = pos; return this; }
    setEnd(pos) { this.#end = pos; return this; }

    getContextNode() { return this.#contextNode; }
    getStart() { return this.#start; }
    getEnd() { return this.#end; }

    toString() {
        return '[Expression]';
    }
}

// Identifier expression
class IdentifierExpression extends Expression {

    #name;

    setName(name) { this.#name = name; return this; }
    getName() { return this.#name; }

    toString() {
        return this.getName();
    }

    static async parse(contextNode, tokenStream) {
        const token = tokenStream.current?.value;
        if (token?.type === 'identifier') {
            return new this(contextNode)
                .setName(token.value)
                .setStart({ line: token.line, column: token.column })
                .setEnd({ line: token.line, column: token.column + token.value.length });
        }
        return null;
    }
}

// Math expression (binary operations)
class MathExpression extends Expression {

    #left;
    #operator;
    #right;

    setLeft(expr) { this.#left = expr; return this; }
    setOperator(op) { this.#operator = op; return this; }
    setRight(expr) { this.#right = expr; return this; }

    getLeft() { return this.#left; }
    getOperator() { return this.#operator; }
    getRight() { return this.#right; }

    toString() {
        return `(${this.getLeft()} ${this.getOperator()} ${this.getRight()})`;
    }

    static async parse(contextNode, tokenStream) {
        const left = await parseExpression(contextNode, tokenStream);
        if (!left) return null;

        const peek = await tokenStream.peek();
        const token = peek?.value;
        if (token?.type === 'operator') {
            await tokenStream.next(); // consume operator
            await tokenStream.next(); // move to next token
            const right = await parseExpression(contextNode, tokenStream);
            if (!right) return null;

            return new this(contextNode)
                .setLeft(left)
                .setOperator(token.value)
                .setRight(right)
                .setStart(left.getStart())
                .setEnd(right.getEnd());
        }

        return left;
    }
}


// Expression grammar: precedence-ordered parser classes
const expressionGrammar = [
    MathExpression,
    IdentifierExpression
];

async function parseExpression(contextNode, tokenStream, grammar = expressionGrammar) {
    for (const ExprClass of grammar) {
        const result = await ExprClass.parse(contextNode, tokenStream, grammar);
        if (result) return result;
    }
    return null;
}

// Entry point
async function parse(input) {
    const tokenStream = await Tokenizer.tokenize(input);
    return await parseExpression(null, tokenStream);
}




// regexes, dollar string, keywords
async function* sampleInput() {
    yield "SELECT * FROM users WHERE name = 'John' AND age > 30 AND address = {";
    yield "  'street': 'Main St', 'city': 'New York', zipcode: /*some comment*";
    yield "/10.001 } ORDER BY name DESC $e2$-nn$kk$nn-$e2$-'dd\\'";
    yield "ee'";
}


//process.exit();
(async () => {
    const tokenStream = await Tokenizer.tokenize(sampleInput(), { ansi: false });

    for await (const token of tokenStream) {
        if (token.type === 'block') {
            console.log('Block:', token.notation);
            for await (const subToken of token.tokens) {
                console.log(subToken);
            }
            console.log('Block end');
            continue;
        }
        console.log(token);
    }
})();
