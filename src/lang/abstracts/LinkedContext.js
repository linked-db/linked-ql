export class LinkedContext {

    #callback;
    #rands = new Map;
    #hashes = new Map;

    #superContext;
    get superContext() { return this.#superContext; }

    #statementNode;
    get statementNode() { return this.#statementNode; }

    get statementContext() {
        if (this.#isStatementContext) return this;
        return this.#superContext.statementContext;
    }

    #isStatementContext;
    get isStatementContext() { return this.#isStatementContext; }

    #artifacts = new Map;
    get artifacts() { return this.#artifacts; }

    constructor(callback, superContext = null, statementNode = null) {
        this.#callback = callback;
        this.#superContext = superContext;
        this.#statementNode = statementNode;
        this.#isStatementContext = !superContext
            || statementNode !== superContext.statementNode;
    }

    rand(type) {
        this.#rands.set(type, !this.#rands.has(type) ? 0 : this.#rands.get(type) + 1);
        const namespace = this.#superContext?.rand(type).replace(`$${type}`, '');
        return `$${type}${namespace ? `${namespace}.` : ''}${this.#rands.get(type)}`;
    }

    hash(value, type) {
        if (!this.#hashes.has(value)) {
            this.#hashes.set(value, this.rand(type));
        }
        return this.#hashes.get(value);
    }

    transform(node, defaultTransform, key, options0, originatingContext = this) {

        const $next = (options1 = options0) => {

            let childContext = this;

            // From superContext:
            // implicitly inherit current instance for sub-transforms
            if (typeof options1 === 'function') {
                childContext = new Context(options1, childContext, this.#statementNode);
                options1 = options0;
            }

            // If this.transform() was called from a subquery scope identified by originatingContext
            if (originatingContext.statementNode !== this.#statementNode) {
                // don't call handlers in this scope
                return defaultTransform(options1, childContext);
            }

            return this.#callback(node, (options2 = options1) => {

                // From callback:
                // implicitly inherit current instance for sub-transforms
                if (typeof options2 === 'function') {
                    childContext = new Context(options2, childContext, this.#statementNode);
                    options2 = options1;
                }

                return defaultTransform(options2, childContext);
            }, key, options1);
        };

        if (this.#superContext) {
            // Call superContext and pass originating scope
            return this.#superContext.transform(node, $next, key, options0, originatingContext);
        }

        return $next();
    }
}