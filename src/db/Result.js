export class Result {

    #rows
    get rows() { return this.#rows; }
    
    constructor({ rows = [] } = {}) {
        this.#rows = rows;
    }
}