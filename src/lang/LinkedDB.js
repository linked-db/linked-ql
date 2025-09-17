import { SchemaSchema } from './ddl/schema/SchemaSchema.js';

export class LinkedDB {

    #searchPath = ['public'];
    get searchPath() { return this.#searchPath; }

    #dbAdapter;

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
        const resultSchemas = await this.#dbAdapter?.showCreate(selector, true) || [];
        if (!resultSchemas.length) return false;
        for (const resultSchema of resultSchemas) {
            const newSchemaSchema = SchemaSchema.fromJSON(resultSchema, { dialect: this.#dbAdapter.dialect });
            for (const existingSchemaSchema of this.#catalog) {
                if (existingSchemaSchema.name().identifiesAs(newSchemaSchema.name())) {
                    for (const existingTableSchema of existingSchemaSchema.tables()) {
                        if (!newSchemaSchema.has(existingTableSchema.name())) {
                            newSchemaSchema.add(existingTableSchema.clone());
                        }
                    }
                    this.#catalog.delete(existingSchemaSchema);
                }
            }
            this.#catalog.add(newSchemaSchema);
        }
        return true;
    }
}