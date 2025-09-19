import { SchemaSchema } from './ddl/schema/SchemaSchema.js';
import { matchSelector, normalizeSelectorArg } from '../db/abstracts/util.js';

export class LinkedDB {

    #searchPath = ['public'];
    get searchPath() { return this.#searchPath; }

    #dbAdapter;
    #queryHistory = new Map;

    #catalog;
    get catalog() { return this.#catalog; }

    #options;
    get options() { return this.#options; }

    constructor({ dbAdapter, catalog = [] } = {}, options = {}) {
        this.#dbAdapter = dbAdapter;
        this.#catalog = new Set(catalog);
        this.#options = options;
    }

    async provide(selector) {
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
            return matchSelector(a, b);
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
        const admit = (schemaName, tables) => {
            diffedSelectors[schemaName] = tables;
            // Create or update a record for the selector
            const newTableList = [].concat(this.#queryHistory.get(schemaName)?.tables || []).concat(tables);
            const newRecord = { schema: schemaName, tables: newTableList, fulfilment: null };
            this.#queryHistory.set(schemaName, newRecord);
            newRecords.push(newRecord);
        };
        const diff = (schemaName, tables) => {
            if (!currentEntries.length) return admit(schemaName, tables);
            const currentEntries_sorted = currentEntries.sort((a, b) => order(schemaName, a, b));
            for (const [schemaNameSpec, existingRecord] of currentEntries_sorted) {
                // See if intersects with schemaNameSpec & currentEntries_sorted
                if (match(schemaName, [schemaNameSpec])) {
                    const diffedTables = tables.filter((t) => !match(t, existingRecord.tables));
                    // If intersects with existingRecord's tables... wait for fulfilment
                    if (diffedTables.length < tables.length) {
                        intersectionFound = true;
                        if (existingRecord.fulfilment) {
                            pendingFulfilments.push(existingRecord.fulfilment);
                        }
                    }
                    if (diffedTables.length) {
                        admit(schemaName, diffedTables);
                    }
                } else {
                    admit(schemaName, tables);
                }
            }
        };
        // -----------------------------
        // Pre-process selector
        selector = normalizeSelectorArg(selector);
        for (const [schemaName, objectNames] of Object.entries(selector)) {
            diff(schemaName, objectNames);
        }
        // -----------------------------
        // Build final fulfilment list
        let currentFulfilment,
            totalFulfilment = Promise.resolve(0);
        if (Object.keys(diffedSelectors).length) {
            currentFulfilment = this.#dbAdapter?.showCreate(diffedSelectors, true);
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
                const newSchemaSchema = SchemaSchema.fromJSON(resultSchema, { dialect: this.#dbAdapter.dialect });
                for (const existingSchemaSchema of this.#catalog) {
                    if (existingSchemaSchema.name().identifiesAs(newSchemaSchema.name())) {
                        // Inherit existing tables from existingSchemaSchema
                        for (const existingTableSchema of existingSchemaSchema.tables()) {
                            if (!newSchemaSchema.has(existingTableSchema.name())) {
                                newSchemaSchema.add(existingTableSchema.clone());
                            }
                        }
                        // Delete existingSchemaSchema
                        this.#catalog.delete(existingSchemaSchema);
                    }
                }
                // Register newSchemaSchema
                this.#catalog.add(newSchemaSchema);
            }
        }
        return await totalFulfilment;
    }
}