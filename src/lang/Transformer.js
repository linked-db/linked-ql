import { registry } from './registry.js';

export class Transformer {

    #callback;
    get cb() { return this.#callback; }

    #rands = new Map;
    #hashes = new Map;

    #superTransformer;
    get superTransformer() { return this.#superTransformer; }

    #statementNode;
    get statementNode() { return this.#statementNode; }

    get statementContext() {
        if (this.#isStatementContext) return this;
        return this.#superTransformer.statementContext;
    }

    #isStatementContext;
    get isStatementContext() { return this.#isStatementContext; }

    #artifacts = new Map;
    get artifacts() { return this.#artifacts; }

    constructor(callback, superTransformer = null, statementNode = null) {
        this.#callback = callback;
        this.#superTransformer = superTransformer;
        this.#statementNode = statementNode;
        this.#isStatementContext = !superTransformer
            || statementNode !== superTransformer.statementNode;
    }

    rand(type, rands = this.#rands) {
        rands.set(type, !rands.has(type) ? 0 : rands.get(type) + 1);
        return `$${type}${rands.get(type)}`;
    }

    hash(value, type, hashes = this.#hashes) {
        if (!hashes.has(value)) {
            hashes.set(value, this.rand(type));
        }
        return hashes.get(value);
    }

    transform(node, defaultTransform, key, options0, originatingContext = this) {

        const $defaultTransform = (options1 = options0, childTransformer = originatingContext) => {

            // From superTransformer:
            // implicitly inherit current instance for sub-transforms
            if (typeof options1 === 'function') {
                childTransformer = new Transformer(options1, childTransformer, this.#statementNode);
                options1 = options0;
            }

            // If this.transform() was called from a subquery scope identified by originatingContext
            if (originatingContext.statementNode !== this.#statementNode) {
                // don't call handlers in this scope
                return defaultTransform(options1, childTransformer);
            }

            return this.#callback(node, (options2 = options1) => {

                // From callback:
                // implicitly inherit current instance for sub-transforms
                if (typeof options2 === 'function') {
                    childTransformer = new Transformer(options2, childTransformer, this.#statementNode);
                    options2 = options1;
                }

                return defaultTransform(options2, childTransformer);
            }, key, options1);
        };

        if (this.#superTransformer) {
            // Call superTransformer and pass originating scope
            return this.#superTransformer.transform(node, $defaultTransform, key, options0, originatingContext);
        }

        return $defaultTransform();
    }
}