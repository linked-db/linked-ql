import {
    matchRelationSelector,
    normalizeRelationSelectorArg
} from '../clients/abstracts/util.js';
import { AbstractStmt } from './abstracts/AbstractStmt.js';
import { registry } from './registry.js';

export class SchemaInference {

    #dialect;
    #catalog;
    #searchPath;
    #queryHistory = new Map;

    get dialect() { return this.#dialect; }
    get catalog() { return this.#catalog; }
    get searchPath() { return this.#searchPath; }

    constructor({ dialect = null, catalog = [], searchPath = ['public'] } = {}) {
        this.#dialect = dialect;
        this.#catalog = new Set(catalog);
        this.#searchPath = searchPath;
    }

    async resolveQuery(query, options = {}) {
        // Parsing...
        if (!(query instanceof registry.SQLScript)
            && !(query instanceof AbstractStmt)
            && !(query instanceof registry.MYSetStmt)
            && !(query instanceof registry.PGSetStmt)) {
            throw new TypeError('query must be an instance of SQLScript | AbstractStmt');
        }
        if (query instanceof registry.SQLScript
            && query.length === 1) {
            query = query.entries()[0];
        }

        // Return if query is a set statement or a standard statement
        if (query instanceof registry.MYSetStmt
            || query instanceof registry.PGSetStmt
            || query instanceof registry.StdStmt
        ) return query;

        // Determine by heuristics if desugaring needed
        if ((query instanceof registry.DDLStmt && !query.returningClause?.()) // Desugaring not applicable
            || query.originSchemas?.()?.length // Desugaring already done
        ) return query;

        // Schema inference...
        const relationSelector = {};
        let anyFound = false;
        query.walkTree((v, k, scope) => {
            if (v instanceof registry.MYSetStmt
                || v instanceof registry.PGSetStmt
                || v instanceof registry.StdStmt
            ) return;
            if (v instanceof registry.DDLStmt
                && !v.returningClause?.()) return;
            if (v instanceof registry.CTEItem) {
                const alias = v.alias()?._get('delim')
                    ? v.alias().value()
                    : v.alias()?.value().toLowerCase();
                scope.set(alias, true);
                return v;
            }
            if ((!(v instanceof registry.TableRef2) || v.parentNode instanceof registry.ColumnIdent)
                && (!(v instanceof registry.TableRef1) || v.parentNode instanceof registry.ColumnRef1)) {
                return v;
            }
            const namespaceName = v.qualifier()?._get('delim')
                ? v.qualifier().value()
                : v.qualifier()?.value().toLowerCase() || '*';
            const tableName = v._get('delim')
                ? v.value()
                : v.value().toLowerCase();
            if (namespaceName === '*' && scope.has(tableName)) return;
            if (!(namespaceName in relationSelector)) {
                relationSelector[namespaceName] = [];
            }
            if (!relationSelector[namespaceName].includes(tableName)) {
                relationSelector[namespaceName].push(tableName);
                anyFound = true;
            }
        }, true);

        if (anyFound) await this.preload(relationSelector, options);

        // DeSugaring...
        return query.deSugar(true, {}, null, this);
    }

    async preload(selector, { dialect = this.dialect, tx = null } = {}) {
        const currentEntries = [...this.#queryHistory.entries()];
        const diffedSelectors = {};
        let intersectionFound = false;
        const pendingFulfilments = [];
        const newRecords = [];
        const match = (a, b) => {
            // Exact match?
            if (b.includes(a)) return true;
            // If incoming is a pattern... no matching
            if (/^!|^%|%$|^\*$/.test(a)) return false;
            // If a IN b
            return matchRelationSelector(a, b);
        };
        const order = (x, a, b) => {
            // Exact match should come first
            if (a[0] === x) return -1;
            if (b[0] === x) return 1;
            // Wildcard should come last
            if (a[0] === '*') return 1;
            if (b[0] === '*') return -1;
            return 0;
        };
        const admit = (namespaceName, tables) => {
            diffedSelectors[namespaceName] = tables;
            // Create or update a record for the selector
            const newTableList = [].concat(this.#queryHistory.get(namespaceName)?.tables || []).concat(tables);
            const newRecord = { namespace: namespaceName, tables: newTableList, fulfilment: null };
            this.#queryHistory.set(namespaceName, newRecord);
            newRecords.push(newRecord);
        };
        const diff = (namespaceName, tables) => {
            if (!currentEntries.length) return admit(namespaceName, tables);
            const currentEntries_sorted = currentEntries.sort((a, b) => order(namespaceName, a, b));
            for (const [namespaceNameSpec, existingRecord] of currentEntries_sorted) {
                // See if intersects with namespaceNameSpec & currentEntries_sorted
                if (match(namespaceName, [namespaceNameSpec])) {
                    const diffedTables = tables.filter((t) => !match(t, existingRecord.tables));
                    // If intersects with existingRecord's tables... wait for fulfilment
                    if (diffedTables.length < tables.length) {
                        intersectionFound = true;
                        if (existingRecord.fulfilment) {
                            pendingFulfilments.push(existingRecord.fulfilment);
                        }
                    }
                    if (diffedTables.length) {
                        admit(namespaceName, diffedTables);
                    }
                } else {
                    admit(namespaceName, tables);
                }
            }
        };
        // -----------------------------
        // Pre-process selector
        selector = normalizeRelationSelectorArg(selector);
        for (const [namespaceName, objectNames] of Object.entries(selector)) {
            diff(namespaceName, objectNames);
        }
        // -----------------------------
        // Build final fulfilment list
        let currentFulfilment,
            totalFulfilment = Promise.resolve(0);
        if (Object.keys(diffedSelectors).length) {
            currentFulfilment = this.showCreate(diffedSelectors, { structured: true, tx });
            pendingFulfilments.push(currentFulfilment);
            for (const newRecord of newRecords) {
                newRecord.fulfilment = currentFulfilment;
            }
            currentFulfilment.finally(() => {
                for (const newRecord of newRecords) {
                    newRecord.fulfilment = null;
                }
            });
            totalFulfilment = Promise.all(pendingFulfilments).then(() => intersectionFound ? 2 : 1);
        } else if (pendingFulfilments.length) {
            totalFulfilment = Promise.all(pendingFulfilments).then(() => -1);
        }
        // -----------------------------
        // Process request if any
        const resultSchemas = await currentFulfilment;
        if (resultSchemas?.length) {
            for (const resultSchema of resultSchemas) {
                // Instantiate...
                const newNamespaceSchema = registry.NamespaceSchema.fromJSON(resultSchema, { dialect });
                for (const existingNamespaceSchema of this.#catalog) {
                    if (existingNamespaceSchema.name().identifiesAs(newNamespaceSchema.name())) {
                        // Inherit existing tables from existingNamespaceSchema
                        for (const existingTableSchema of existingNamespaceSchema.tables()) {
                            if (!newNamespaceSchema.has(existingTableSchema.name())) {
                                newNamespaceSchema.add(existingTableSchema.clone());
                            }
                        }
                        // Delete existingNamespaceSchema
                        this.#catalog.delete(existingNamespaceSchema);
                    }
                }
                // Register newNamespaceSchema
                this.#catalog.add(newNamespaceSchema);
            }
        }
        return await totalFulfilment;
    }

    async showCreate(selector, options = {}) {
        throw new Error(`showCreate() must be called on a child class`);
    }
}