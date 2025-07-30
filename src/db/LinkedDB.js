export class LinkedDB {

    #searchPath = ['public'];
    get searchPath() { return this.#searchPath; }

    #catalog;
    get catalog() { return this.#catalog; }

    #options;
    get options() { return this.#options; }

    constructor({ catalog = [] } = {}, options = {}) {
        this.#catalog = new Set(catalog);
        this.#options = options;
    }
}