import * as toktypes from './toktypes.js';

class TokenStreamState {
    buffer = '';
    cursor = 0;
    line = 1;
    column = 1;
    mysqlBindingIndex = 0;
    nestingContext = [];
    nextTokenEscape = 0;
    next(by = 1, isLf = false) {
        if (isLf) {
            this.line++;
            this.column = 0; // To immediately become 1 below
        }
        this.column += by;
        this.cursor += by;
        if (this.nextTokenEscape === 1) {
            this.nextTokenEscape = 2;
        } else if (this.nextTokenEscape === 2) {
            this.nextTokenEscape = 0;
        }
    }
}

export class TokenStream {

    #iterator;
    #options;
    #locked = false;
    #started = false;
    #done = false;

    #rootSavepoint = null;
    #history = [];
    #current;
    #peeks = [];

    constructor(iterator, { state: _, ...options } = {}) {
        this.#iterator = iterator;
        this.#options = options;
    }

    [Symbol.asyncIterator]() {
        return this; // Make it an async iterator
    }

    get options() { return this.#options; }

    get locked() { return this.#locked; }

    get started() { return this.#started; }

    get done() { return this.#done && !this.#peeks.length; }

    previous() {
        return this.#history[this.#history.length - 1];
    }

    current() {
        return this.#current;
    }

    async next() {
        this.#assertNotLocked('next()');
        this.#started = true;
        let value, done = false;
        if (this.#peeks.length) {
            this.#historyPush(this.#current);
            this.#current = this.#peeksShift();
            value = this.#current;
        } else {
            ({ value, done } = await this.#iterator.next());
            this.#historyPush(this.#current);
            this.#current = value;
            this.#done = done;
        }
        if (this.#rootSavepoint !== null && value?.type.endsWith('_block')) {
            value.value.savepoint();
        }
        return { value, done };
    }

    async match($type, $value = undefined) {
        const [peek, type, value] = typeof arguments[0] === 'number'
            ? arguments
            : [0, $type, $value];
        const match = (tok) => {
            return tok && (
                (Array.isArray(type) ? type.includes(tok.type) : type === tok.type) && (
                    value === undefined || (Array.isArray(value) ? (value.includes(tok.value) || value.includes(undefined)) : value === tok.value)
                )
            ) && tok || undefined;
        };
        if (peek === Infinity) {
            // Match progressively
            let i = 0, tok;
            while (tok = await this.peek(i++)) {
                if (match(tok)) return tok;
            }
            return;
        }
        return match(
            peek ? await this.peek(peek) : this.current()
        );
    }

    async peek(length = 1) {
        if (length === 0) return this.#current;
        let $length = length - this.#peeks.length;
        while ($length) {
            const next = await this.#iterator.next();
            if (next.done) break;
            this.#peeksPush(next.value);
            $length--;
        }
        const tok = this.#peeks[length - 1];
        return tok;
    }

    async eat(type = undefined, value = undefined) {
        const tok = !type ? this.current() : await this.match(type, value);
        if (tok) (await this.next())?.value; // advance
        return tok;
    }

    async expect(type, value = undefined) {
        const tok = await this.eat(type, value);
        if (!tok) throw new Error(`Expected token: ${type}${value ? ` (${value})` : ''}`);
        return tok;
    }

    // Normal token flow

    #historyPush(tok) {
        // this.#history.push() <-- tok (this.#current)
        if (tok?.type.endsWith('_block')) {
            //tok.value.#locked = true;
        }
        if (this.#rootSavepoint !== null) {
            this.#history.push(tok);
        } else {
            this.#history = [tok];
        }
    }

    #peeksShift() {
        // tok (this.#current) <-- this.#peeks.shift()
        const tok = this.#peeks.shift();
        if (tok?.type.endsWith('_block')) {
            tok.value.#locked = false;
        }
        return tok;
    }

    // Reverse token flow

    #historyPop() {
        // this.#history.pop() --> tok (this.#current)
        const tok = this.#history.pop();
        if (tok?.type.endsWith('_block')) {
            //tok.value.#locked = false;
            tok.value.restore(tok.value.#rootSavepoint);
        }
        return tok;
    }

    #peeksUnshift(tok) {
        // tok (this.#current) --> this.#peeks.unshift()
        if (tok?.type.endsWith('_block')) {
            tok.value.restore(tok.value.#rootSavepoint);
            tok.value.#locked = true;
        }
        this.#peeks.unshift(tok);
    }

    // Peeking token flow

    #peeksPush(tok) {
        if (tok?.type.endsWith('_block')) {
            tok.value.#locked = true;
        }
        this.#peeks.push(tok);
    }

    #assertNotLocked(method) {
        if (this.#locked) {
            throw new Error(`Can't execute ${method}; TokenStream is locked`);
        }
    }

    savepoint() {
        this.#assertNotLocked('savepoint()');
        const point = this.#history.length;
        if (this.#rootSavepoint === null) {
            this.#rootSavepoint = point;
        }
        return point;
    }

    savepointStatus() {
        return this.#rootSavepoint !== null
            ? this.#history.length
            : null;
    }

    restore(toIndex) {
        this.#assertNotLocked('restore()');
        if (this.#rootSavepoint === null || typeof toIndex !== 'number' || toIndex > this.#history.length) {
            throw new Error(`Invalid restore point ${toIndex}${this.#rootSavepoint === null ? '. Not in savepoint mode' : ''}`);
        }
        while (toIndex < this.#history.length) {
            if (this.#current) {
                this.#peeksUnshift(this.#current);
            }
            this.#current = this.#historyPop();
        }
    }

    commit(toIndex) {
        this.#assertNotLocked('commit()');
        if (toIndex !== this.#rootSavepoint) return;
        let tok;
        while (toIndex < this.#history.length && (tok = this.#historyPop())) {
            if (tok.type.endsWith('_block')) {
                tok.value.commit(tok.value.#rootSavepoint);
            }
        }
        this.#rootSavepoint = null;
    }

    // Returns ToeknStream
    static async create(input, { dialect = 'postgres', state = new TokenStreamState, ...options } = {}) {
        if (Array.isArray(input) && input.every((s) => typeof s === 'object' && s?.type) && (input = input.slice())) {
            return new this(
                input[Symbol.iterator](),
                { dialect, ...options },
            );
        }
        // Normalize options. Consumers of the instance (i.e. parsers) might benefit from it
        if (!options.normalized) {
            options = normalizeOptions({ dialect, ...options, normalized: true });
        }
        return new this(
            await this.createIterator(input, { dialect, state, ...options, extendedAPI: true }),
            { dialect, ...options },
        );
    }

    // Factory input -> to stream
    static toIterator(input) {
        if (typeof input[Symbol.asyncIterator] === 'function') {
            return typeof input.next === 'function' ? input : input[Symbol.asyncIterator]();
        }
        if (typeof input[Symbol.iterator] === 'function' && typeof input !== 'string' && !(input instanceof String)) {
            return typeof input.next === 'function' ? input : input[Symbol.iterator]();
        }
        return (function* () { yield input + ''; })();
    }

    // Returns Iterator
    static async * createIterator(input, { dialect = 'postgres', state = new TokenStreamState, ...options } = {}) {

        // Normalize input to stream
        const stream = this.toIterator(input);
        // Validate "dialect" and "state" input
        if (!['postgres', 'mysql'].includes(dialect)) {
            throw new Error(`Unknown dialect: ${dialect}`);
        }
        if (!(state instanceof TokenStreamState)) {
            throw new Error('options.state must be an instance of TokenStreamState');
        }
        // Normalize options. Should it not have come from this.create()
        if (!options.normalized) {
            options = normalizeOptions({ dialect, ...options, normalized: true });
        } else {
            options = { dialect, ...options };
        }
        // Local state
        const localState = {
            token: null,
            prevEmittedToken: null,
            nextTokenSpaceBefore: '',
            multiwordBuffer: [],
        };
        // Route token normalization
        const $finalizeToken = (token, forceYield = false) => {
            if (!token) return [];
            const result = finalizeToken(token, { options, state, localState }, forceYield);
            return result;
        };

        // Iterate over the input stream chunk by chunk
        let chunk = { value: '' };
        do {
            state.buffer += chunk.value || ''/*when done*/;
            let char;
            while (char = state.buffer[state.cursor]) {

                const possiblyChunked = state.buffer[state.cursor + 1] === undefined && !chunk.done;
                const charIsWhitespace = whitespace.has(char);
                const $throw = () => {
                    throw new SyntaxError(`Unexpected token: ${char} at line ${state.line}, column ${state.column}`);
                }

                /**
                 * ----------
                 * PART A:
                 * Feed or terminate sequences
                 */

                // ----------
                // Feed (with validation) or terminate special literals.
                // !ORDER: Note that because we're handling the ending of non-delimited "literals" here, (by whitespace)
                // this block must run before the generic whitespace-handling block below
                // Meanhwile, we're also using the opportunity to handle delimited ones's ending
                if (localState.token?.type === 'hex_literal' || localState.token?.type === 'bit_literal') {
                    const isEndTag = localState.token.delim ? char === localState.token.delim : charIsWhitespace;
                    if (isEndTag) {
                        yield* $finalizeToken(localState.token);
                        localState.token = null;
                        if (charIsWhitespace && options.spaces) {
                            localState.nextTokenSpaceBefore += char;
                        }
                    } else {
                        const type = localState.token?.type;
                        if (type === 'hex_literal') {
                            if (!/[0-9A-Fa-f]/.test(char)) $throw();
                        } else {
                            if (!/[01]/.test(char)) $throw();
                        }
                        localState.token.value += char;
                    }
                    state.next();
                    continue;
                }

                // ----------
                // Feed (with validation) or terminate "version_specs".
                // !ORDER: Note that because we're handling the ending of non-delimited "version_specs" here, (by whitespace or dot)
                // this block must run before the generic whitespace-handling block below
                // Meanhwile, we're also using the opportunity to handle delimited ones's ending
                if (localState.token?.type === 'version_spec') {
                    const isEndQuote = localState.token.delim && char === localState.token.delim;
                    const isEndTag = isEndQuote || (charIsWhitespace || char === '.' || char === ',' || char === ';' || char === ')');
                    if (isEndTag) {
                        yield* $finalizeToken(localState.token);
                        localState.token = null;
                    } else if (localState.token.value) {
                        if (char === '=') {
                            // "=" only allowed as @=2_4, @<=4, @>=2
                            if (!['<', '>'].includes(localState.token.value)) $throw();
                        } else if (char === '_') {
                            // "_" only allowed as digits separator
                            if (!/\d$/.test(localState.token.value)) $throw();
                        } else if (!/\d/.test(char)) $throw();
                        localState.token.value += char;
                    } else {
                        localState.token.value += char;
                    }
                    if (!isEndTag || isEndQuote) {
                        state.next();
                        continue;
                    }
                }

                // ----------
                // Whitespace and Linebreaks end sequences
                // but:
                // - whitespace is contigious with strings, delimited idents, and comments
                // - line breaks end single-line comments
                // !ORDER: Handle this early, but after the "literals" block above.
                if (charIsWhitespace) {
                    const isString = localState.token?.type === 'string_literal';
                    const isDelimitedIdent = localState.token?.type === 'identifier' && localState.token.delim;
                    const isBlockComment = localState.token?.type === 'block_comment';
                    const isLineComment = localState.token?.type === 'line_comment';
                    if (isString || isDelimitedIdent || isBlockComment || isLineComment && !(
                        char === '\r' || char === '\n')
                    ) {
                        // Not a single-line comment ending. Treat as contigious!
                        localState.token.value += char;
                    } else {
                        // Whitespace starting...? End current token!
                        const prevChar = state.buffer[state.cursor - 1];
                        if (!whitespace.has(prevChar) && localState.token) {
                            yield* $finalizeToken(localState.token);
                            localState.token = null;
                        }
                        if (options.spaces) {
                            localState.nextTokenSpaceBefore += char;
                        }
                    }
                    if (char === '\n' || char === '\r') {
                        state.next(1, true);
                    } else {
                        state.next();
                    }
                    continue;
                }

                // ----------
                // Handle backslahes in strings when in backslah-escaping mode
                // - or when in nested context and is a Double Colon-escaping position
                // !ORDER: Handle backslashes early.
                if (char === '\\') {
                    if (possiblyChunked) break; // We need to look ahead to know if this is comment ending
                    let nextChar = state.buffer[state.cursor + 1];
                    // String char escaping...
                    const strings_inBackslashEscapeMode = localState.token?.type === 'string_literal' && (options.dialect === 'mysql' ? !options.mysqlNoBackslashEscapes : localState.token.modifier === 'E');
                    const strings_atEscapePosition = nextChar === localState.token?.delim || nextChar === '\\' || nextChar === '0' || nextChar === 'b' || nextChar === 'f' || nextChar === 'n' || nextChar === 'r' || nextChar === 't' || nextChar === 'v' || nextChar === 'Z';
                    if (strings_inBackslashEscapeMode && strings_atEscapePosition) {
                        nextChar = {
                            '\\': '\\', // to backslash char itself, here for completeness
                            '0': '\0', // to NUL byte (ASCII 0)
                            'b': '\b', // to backspace (ASCII 8)
                            'f': '\f', // to form feed
                            'n': '\n', // to newline
                            'r': '\r', // to carriage return
                            't': '\t', // to tab
                            'v': '\v', // to vertical tab
                            'Z': '\x1A', // to ASCII 26 (SUB / Control+Z) - represented as \x1A in JS
                        }[nextChar] || nextChar;
                        localState.token.value += nextChar;
                        state.next(2);
                        continue;
                    }
                    state.nextTokenEscape = 1;
                    state.next();
                    continue;
                }

                // ----------
                // Feed or terminate:
                // - block_comment
                // - string_literal
                // - delimited identifier
                // - delimited user_var
                if (localState.token?.type === 'block_comment'
                    || localState.token?.type === 'line_comment' // For feeding
                    || localState.token?.type === 'string_literal'
                    || (localState.token?.type === 'identifier' && localState.token.delim)
                    || (localState.token?.type === 'user_var' && localState.token.delim)/*MySQL @'user-var'*/) {
                    let tokenEndSteps;
                    if (localState.token.type === 'block_comment') {
                        if (char === '*') {
                            if (possiblyChunked) break; // We need to look ahead to know if this is comment ending
                            const nextChar = state.buffer[state.cursor + 1];
                            tokenEndSteps = nextChar === '/' ? 2 : 0; // 2 chars for end tag, 0 otherwise: not a comment end
                        }
                    } else if (char === localState.token.delim) {
                        // Two contiqious delims is escape when is identifier
                        const twoContiqiousDelimsIsEscape = localState.token.type === 'identifier'
                            // Or for strings, when not using backslash as escape
                            || localState.token.type === 'string_literal' && (options.dialect === 'mysql' ? options.mysqlNoBackslashEscapes : localState.token.modifier !== 'E');
                        // Do escaping if so
                        if (twoContiqiousDelimsIsEscape) {
                            if (possiblyChunked) break; // We need to look ahead to know if this is an quote escape quote
                            const nextChar = state.buffer[state.cursor + 1];
                            if (nextChar === char) {
                                localState.token.value += char; // Pick one of the two quotes
                                state.next(2); // and eat the other
                                continue;
                            }
                        }
                        // End token otherwise: char === localState.token.delim
                        tokenEndSteps = 1;
                    } else if (localState.token.type === 'string_literal' && localState.token.delim.startsWith('$')/*postgres*/ && char === '$') {
                        // Specially catch Postgres' dollar-delims
                        const cursor = state.cursor + 1;
                        if (state.buffer.slice(cursor - localState.token.delim.length, cursor) === localState.token.delim) {
                            localState.token.value = localState.token.value.slice(0, - localState.token.delim.length + 1);
                            tokenEndSteps = 1;
                        }
                    }
                    if (tokenEndSteps) {
                        yield* $finalizeToken(localState.token);
                        localState.token = null;
                        state.next(tokenEndSteps);
                        continue;
                    }
                    // Feed ongoing sequence
                    localState.token.value += char;
                    state.next();
                    continue;
                }

                // ----------
                // Handle closing nesting delims:
                // - }
                // - ]
                // - )
                if (state.nestingContext.length && char === { '{': '}', '[': ']', '(': ')' }[state.nestingContext[0]]) {
                    yield* $finalizeToken(localState.token, true);
                    state.nestingContext.shift();
                    if (options.structured) {
                        state.next(); // Eat the end tag
                        localState.nestingEndTagSeen = true;
                        return;
                    }
                    localState.token = null;
                }

                /**
                 * ----------
                 * PART B:
                 * Start or restart sequences
                 */

                // ----------
                // Start
                // - comments
                // - strings
                // - identifiers
                let tokenStart, tokenStartBacksteps = 0, tokenStartForwardsteps = 0;

                if (options.dialect === 'postgres') {
                    // Postgres' dollars :)
                    if (localState.token?.type === 'pg_possible_dollar_delim' || char === '$') {
                        // Catch the beginning of Postgres' dollar-delims
                        if (localState.token?.type === 'pg_possible_dollar_delim') {
                            if (char === '$') {
                                const { type: _, value, delim: __, ...restTok } = localState.token;
                                localState.token = { type: 'string_literal', value: '', delim: `$${value}$`, ...restTok };
                            } else {
                                localState.token.value += char;
                            }
                            state.next();
                            continue;
                        }
                        if (possiblyChunked) break; // We need to look ahead to know if this is bind_var or...
                        const nextChar = state.buffer[state.cursor + 1];
                        if (/[0-9]/.test(nextChar)) {
                            tokenStart = { type: 'bind_var' };
                        } else {
                            // ...possible dollar-delimited string
                            tokenStart = { type: 'pg_possible_dollar_delim', delim: char };
                        }
                    }
                } else if (options.dialect === 'mysql') {
                    // MySQL's questions :)
                    if (char === '?') {
                        tokenStart = { type: 'bind_var' };
                    }
                    // MySQL's hash comments :)
                    if (char === '#') {
                        tokenStart = { type: 'line_comment', delim: char };
                    }
                    // MySQL's backflips :)
                    if (char === '`') {
                        tokenStart = { type: 'identifier', delim: char };
                    }
                }

                // Strings and ansi-delimited identifers
                if (char === "'") {
                    const modifierPattern = new RegExp(`(@)$|^\\W?(${options.dialect === 'postgres' ? 'E|X|B' : 'N|X'})$`, 'i');
                    const modifierMatch = state.buffer.slice(Math.max(state.cursor - 2, 0), state.cursor).match(modifierPattern);
                    const modifier = modifierMatch?.[1] || modifierMatch?.[2];
                    // First try to match LinkedQL version tag
                    if (modifier === '@' && localState.prevEmittedToken?.type === 'identifier') {
                        if (possiblyChunked) break; // We need to look ahead to properly determine if variable
                        const nextChar = state.buffer[state.cursor + 1];
                        if (/[\^~=\d<>!]/.test(nextChar)) {
                            // Resolve to @'1_1_tags'
                            tokenStart = { type: 'version_spec', delim: char };
                            tokenStartBacksteps = 1;
                        }
                    }
                    // Otherwise, resolve to:
                    // E'new\\nline' (postgres)
                    // N'unicode' (mysql)
                    // X'FF' (mysql && postgres)
                    // B'0101' (postgres)
                    // @'mysql-user-var' (mysql)
                    if (!tokenStart) {
                        if (modifier && (modifier !== '@' || options.dialect === 'mysql')) {
                            const type = /^(E|N)/i.test(modifier) ? 'string_literal' : (
                                modifier === '@' ? 'user_var' : (modifier === 'X' ? 'hex_' : 'bit_') + 'literal'
                            );
                            tokenStart = { type, ...(type === 'string_literal' ? { modifier: modifier.toUpperCase() } : {}), delim: char };
                            tokenStartBacksteps = modifier === '@' ? 1 : modifier.length;
                        } else {
                            tokenStart = { type: 'string_literal', delim: char };
                        }
                    }
                } else if (char === '"') {
                    const type = options.dialect !== 'mysql' || options.mysqlAnsiQuotes ? 'identifier' : 'string_literal';
                    tokenStart = { type, delim: char };
                }

                if (char === '@') {
                    // LinkedQL version tag or MySQL user/system variable?
                    if (possiblyChunked) break; // We need to look ahead to properly determine if variable
                    const nextChar = state.buffer[state.cursor + 1];
                    if ((localState.token || localState.prevEmittedToken)?.type === 'identifier' && /[\^~=\d<>!]/.test(nextChar)) {
                        // LinkedQL @1_1_tags
                        tokenStart = { type: 'version_spec' };
                    } else if (options.dialect === 'mysql') {
                        // MySQL's varieties :)
                        if (nextChar === '@') {
                            // MySQL system variables
                            tokenStart = { type: 'system_var' };
                            tokenStartForwardsteps = 1;
                        } else if (/[a-zA-Z_$]/.test(nextChar)) {
                            // MySQL user-defined variables
                            tokenStart = { type: 'user_var' };
                        }
                    }
                }

                // Comments
                if (char === '/' || char === '-') {
                    if (possiblyChunked) break; // We need to look ahead to know if this is comment starting
                    const nextChar = state.buffer[state.cursor + 1];
                    if (char === '/' && nextChar === '*') {
                        tokenStart = { type: 'block_comment' };
                        tokenStartForwardsteps = 1;
                    } else if (char === '-' && nextChar === '-') {
                        tokenStart = { type: 'line_comment', delim: char + nextChar };
                        tokenStartForwardsteps = 1;
                    }
                }

                // Start token
                if (tokenStart) {
                    if (localState.token && !tokenStartBacksteps) {
                        yield* $finalizeToken(localState.token);
                    }
                    localState.token = { type: tokenStart.type, value: '', ...tokenStart, line: state.line, column: tokenStartBacksteps ? state.column - tokenStartBacksteps : state.column };
                    state.next(1 + tokenStartForwardsteps);
                    continue;
                }

                // ----------
                // Start nesting:
                // - {
                // - [
                // - (
                if (char === '{' || char === '[' || char === '(') {
                    // When we encounter an opening nesting delim, we enter sub-tokenization
                    yield* $finalizeToken(localState.token);
                    localState.token = null;
                    state.nestingContext.unshift(char);
                    if (options.structured) {
                        state.next();
                        const groupToken = {
                            type: { '{': 'brace_block', '[': 'bracket_block', '(': 'paren_block' }[char],
                            value: await this[options.extendedAPI ? 'create' : 'createIterator'](stream, { state, ...options }),
                            line: state.line,
                            column: state.column,
                        };
                        yield* $finalizeToken(groupToken);
                        if (options.extendedAPI) {
                            await groupToken.value.peek(Infinity);
                        } else {
                            while (!(await groupToken.value.next()).done);
                        }
                        continue;
                    }
                }

                /**
                 * ----------
                 * PART C:
                 * Handle more nuanced sequences
                 */

                if (/[0-9]/.test(char)) {
                    // A number "literal" or MySQL's HEX "literal" or Postgres' BIN "literal"
                    // Passed along if this is part of an "identifier", "bind_var", "version_spec", "*_literal", or  "*_var" sequence
                    if (localState.token?.type !== 'identifier' && localState.token?.type !== 'bind_var' && localState.token?.type !== 'version_spec' && !localState.token?.type.endsWith('_literal') && !localState.token?.type.endsWith('_var')) {
                        yield* $finalizeToken(localState.token);
                        if (/*HEX: 0xFF*/char === '0') {
                            if (possiblyChunked) break; // We need to look ahead to know if this is an X
                            const $type = state.buffer[state.cursor + 1]?.toUpperCase();
                            if (($type === 'X' || $type === 'B') && options.dialect === 'mysql') {
                                localState.token = { type: ($type === 'X' ? 'hex_' : 'bit_') + 'literal', value: '', line: state.line, column: state.column };
                                state.next(2);
                                continue;
                            }
                        }
                        localState.token = { type: 'number_literal', value: char, line: state.line, column: state.column };
                        state.next();
                        continue;
                    }
                } else if (/[a-zA-Z_]/.test(char)) {
                    // Alphanumeric sequences that start as "identifier" but could translate to "keywords", "identifiers", or even "operators"
                    // Passed along if this is part of a "identifier" or "*_var" sequence or is the "E" in Scientific number notations
                    if (localState.token?.type !== 'identifier' && !localState.token?.type.endsWith('_var') && !(localState.token?.type === 'number_literal'
                        && /*EXP: 30e2*/(/\d$/.test(localState.token.value) && /E/i.test(char)))) {
                        // Throw if in mid-number sequence
                        if (localState.token?.type === 'number_literal') $throw();
                        yield* $finalizeToken(localState.token);
                        // Start identifier
                        localState.token = { type: 'identifier', value: char, line: state.line, column: state.column };
                        state.next();
                        continue;
                    }
                } else {
                    // Handle punctuations and operators
                    let type = 'operator';
                    if (char === ';'
                        || char === ','
                        || char === ':'
                        || char === '{'
                        || char === '}'
                        || char === '['
                        || char === ']'
                        || char === '('
                        || char === ')') {
                        if (char === ':' && (state.nestingContext[0] !== '{' || state.nextTokenEscape)) {
                            type = 'operator'; // Postgres' colon is an operator, not a punctuation
                        } else {
                            type = 'punctuation';
                        }
                        if (options.dialect === 'postgres' && char === ':' && type === 'operator' && localState.token?.type !== 'operator') {
                            const previousChar = state.buffer[state.cursor - 1];
                            if (possiblyChunked) break; // We need to look ahead to know if this is number starting
                            const nextChar = state.buffer[state.cursor + 1];
                            if (previousChar !== ':' && /[a-zA-Z_]/.test(nextChar) && options.PL_SQL !== false) {
                                type = 'user_var'; // PL/SQL variable
                                char = '';
                            }
                        }
                    } else if (char === '.') {
                        if (localState.token?.type === 'number_literal') {
                            // Mid-number punctuation; floats
                            if (localState.token.value.includes('.')) $throw();
                            type = 'number_literal'; // e.g. 2.4
                        } else {
                            // Pre-number punctuation? Same floats?
                            if (possiblyChunked) break; // We need to look ahead to know if this is number starting or a punctuation
                            const nextChar = state.buffer[state.cursor + 1];
                            if (/\d/.test(nextChar)) {
                                type = 'number_literal'; // e.g. ".004"
                            } else {
                                // Other punctuation. Standalone token:
                                // e.g. tbl.col, tbl.*, db@<3_2."000-u".id
                                type = 'punctuation'; // e.g. "tbl.col", "tbl . col"
                                // Or maybe MySQL special var punctuation?
                                if (localState.token?.type === 'system_var') {
                                    type = 'system_var'; // e.g. "@@session. autocommit"
                                }
                            }
                        }
                    } else if (char === '+' || char === '-') {
                        if (localState.token?.type === 'number_literal' && /E$/i.test(localState.token.value)) {
                            // Scientific number notation; EXP: 30e-2
                            if (/\+|\-/.test(localState.token.value)) $throw();
                            type = 'number_literal';
                        }
                    }

                    // Feed an ongoing sequence or terminate that and start a new one?
                    if (localState.token?.type !== type || type === 'punctuation' || (
                        type === 'operator' && !options.operators.classic.has(`${localState.token.value}${char}`) /*not a valid operator afterall? e.g. "=-"*/
                    )) {
                        yield* $finalizeToken(localState.token);
                        localState.token = { type, value: char, line: state.line, column: state.column };
                        state.next();
                        continue;
                    }

                    // Passed thru to feed an ongoing sequence
                }

                localState.token.value += char;
                state.next();
            }

            if (chunk.done) break;
            // Update buffer to handle overflow and continue from next chunk
            state.buffer = state.buffer.slice(state.cursor);
            state.cursor = 0;
        } while (chunk = await stream.next());

        if (localState.token) {
            if (
                (localState.token.type === 'operator' && localState.token.value !== '*')
                || localState.token.type === 'number_literal' && /E$/i.test(localState.token.value)
                || localState.token.type === 'block_comment'
                || localState.token.type === 'pg_possible_dollar_delim'
                || (
                    ['string_literal', 'hex_literal', 'bit_literal', 'identifier', 'version_spec', 'user_var'].includes(localState.token.type)
                    && localState.token.delim
                )) {
                throw new SyntaxError(`Unterminated ${localState.token.type} at line ${state.line}, column ${state.column}`);
            }
            yield* $finalizeToken(localState.token, true);
        }
        if (state.nestingContext.length && !localState.nestingEndTagSeen) {
            throw new SyntaxError(`Unterminated nesting "${state.nestingContext[0]}" at line ${state.line}, column ${state.column}`);
        }
    }
}

// Lookups
const whitespace = new Set([' ', '\f', '\n', '\r', '\t', '\v',]);

// Normalize options
function normalizeOptions(options) {
    // Build the following list into our formats
    const addMultiWord = (targetMap, prefix, tok, token) => {
        tok.split(' ').reduce((_tok, chunk) => {
            _tok = _tok ? `${_tok} ${chunk}` : chunk;
            targetMap.set(_tok, token);
            return _tok;
        }, prefix);
    };
    for (const tokenCategory of ['statements', 'functionNames', 'aggrFunctionNames', 'keywords', 'operators', 'dataTypes']) {
        const $tokenCategory = ['statements', 'functionNames', 'aggrFunctionNames'].includes(tokenCategory) ? 'keywords' : tokenCategory;
        const tokenRegistry = options[$tokenCategory] || { classic: new Map, compound: new Map };
        for (const tokenDialectBranch of ['common', options.dialect === 'mysql' ? 'mysql' : 'postgres']) {
            const entries = toktypes[tokenCategory][tokenDialectBranch];
            for (const entry of entries) {
                const [value, token] = Array.isArray(entry) ? [entry[0], { ...entry[1], value: entry[0] }] : [entry, { value: entry }];
                if (value.includes(' ')) {
                    addMultiWord(tokenRegistry.compound, '', value, token);
                } else {
                    tokenRegistry.classic.set(value, token);
                }
            }
        }
        options = { ...options, [$tokenCategory]: tokenRegistry };
    }
    return options;
}

// Finalize tokens
function finalizeToken(token, { options, state, localState }, forceYield = false) {
    if (localState.nextTokenSpaceBefore) {
        const { type, ...tok } = token;
        token = { type, spaceBefore: localState.nextTokenSpaceBefore, ...tok };
        localState.nextTokenSpaceBefore = '';
    }
    if (token.type === 'block_comment' || token.type === 'line_comment') {
        return finalizeComment(token, { options });
    }
    let finalToken, identResolution = false;
    if (options.dialect === 'mysql' && token.type === 'bind_var') {
        finalToken = [{ ...token, value: `${++state.mysqlBindingIndex}` }];
    } else if (token.type === 'operator') {
        // Add operator definition details
        const { line, column, ...restTok } = token;
        finalToken = [{
            ...restTok,
            ...(options.operators.classic.get(token.value) || {}),
            line,
            column,
        }];
    } else if (token.type === 'identifier' && !token.delim) {
        finalToken = finalizeIdentifier(token, { options, state, localState }, forceYield);
        identResolution = true;
    }
    if (!finalToken/*Without asking length*/) {
        finalToken = [token];
    }
    // -----
    if (finalToken?.length) {
        localState.prevEmittedToken = finalToken[0];
    } else {
        localState.prevEmittedToken = token;
    }
    // -----
    if (!identResolution && finalToken.length && localState.multiwordBuffer.length) {
        return localState.multiwordBuffer.splice(0).concat(finalToken);
    }
    return finalToken;
}

// Finalize comment tokens
function finalizeComment(token, { options }) {
    if (!options.comments) return [];
    if (token.type === 'block_comment') {
        token = { ...token, value: token.value.split('\n').map((s) => s.replace(/^[ ]+\*[ ]+?/, '').trim()).join('\n') };
    } else {
        token = { ...token, value: token.value.trim() };
    }
    return [token];
}

// Finalize "literal" tokens
function finalizeIdentifier(token, { options, state, localState }, forceYield = false) {
    let finalToken,
        multiwordBufferLength = localState.multiwordBuffer.length;
    // Yield or build multiword operators
    const wordSoFar = (
        multiwordBufferLength ? localState.multiwordBuffer.map((tok) => tok.value).concat(token.value).join(' ') : token.value
    ).toUpperCase();

    const findInBranch = (branch) => {
        for (const tokenCategory of ['keywords', 'operators', 'dataTypes']) {
            const matchResult = options[tokenCategory][branch].get(wordSoFar);
            if (matchResult) return [tokenCategory, matchResult];
        }
        return [];
    };

    const processExactMatch = () => {
        let { type: _, spaceBefore, line, column, ...restTok } = token;
        if (multiwordBufferLength) {
            spaceBefore = localState.multiwordBuffer[0].spaceBefore;
            line = localState.multiwordBuffer[0].line;
            column = localState.multiwordBuffer[0].column;
        }
        const tok = {
            type: tokenCategory === 'dataTypes' ? 'data_type' : tokenCategory.replace(/s$/, ''),
            ...(spaceBefore ? { spaceBefore } : {}),
            ...restTok,
            ...matchResult, // Final value in here and overriding restTok.value
            value: wordSoFar,
            line, // "line" and "column" coming last now
            column
        };
        if (multiwordBufferLength) {
            finalToken = [tok];
            localState.multiwordBuffer.splice(0);
            multiwordBufferLength = 0;
        } else {
            finalToken = [tok];
        }
    };
    const processPartialMatch = () => {
        const tok = { ...token, type: tokenCategory === 'dataTypes' ? 'data_type' : tokenCategory.replace(/s$/, '') };
        localState.multiwordBuffer.push(tok);
        finalToken = [];
    };

    let multiwordMatched = false;
    let [tokenCategory, matchResult] = findInBranch('compound');
    if (matchResult?.value === wordSoFar) {
        processExactMatch();
        multiwordMatched = true;
    } else if (matchResult) {
        // first (e.g. DISTINCT kw vs DISTINCT FROM op)
        const [tokenCategory2, matchResult2] = findInBranch('classic');
        if (matchResult2 && tokenCategory2 !== tokenCategory) {
            [tokenCategory, matchResult] = [tokenCategory2, matchResult2];
        }
        if (forceYield) {
            processExactMatch();
        } else {
            processPartialMatch();
        }
        multiwordMatched = true;
    } else {
        [tokenCategory, matchResult] = findInBranch('classic');
        if (matchResult) {
            processExactMatch();
            multiwordMatched = true;
        }
    }
    if (!multiwordMatched && multiwordBufferLength) {
        const existing = localState.multiwordBuffer.splice(0);
        const current = finalizeToken(token, { options, state, localState });
        return [...existing, ...current];
    }
    // Treat as identifier
    if (!finalToken && /^(TRUE|FALSE|NULL|UNKNOWN)$/i.test(token.value)) {
        const { type: _, ...tok } = token;
        finalToken = [{
            type: /UNKNOWN/.test(token.value) ? 'unknown_literal' : (/NULL/i.test(token.value) ? 'null_literal' : 'bool_literal'),
            ...tok,
            value: token.value.toUpperCase(),
        }];
    }
    return finalToken;
}
