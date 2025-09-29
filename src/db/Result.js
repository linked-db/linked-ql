export class Result {

    #rows
    #rowCount

    get rows() { return this.#rows; }
    get rowCount() { return this.#rowCount; }
    
    constructor({ rows = [], rowCount = 0 } = {}) {
        this.#rows = rows;
        this.#rowCount = rowCount;
    }
}