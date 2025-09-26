export class ConflictError extends Error {

    #existing;
    get existing() { return this.#existing; }

    constructor(message, existing) {
        super(message);
        this.#existing = existing;
    }
}
