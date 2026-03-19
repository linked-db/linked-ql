export class BootstrapTable {

    #rows;

    constructor(rows) {
        this.#rows = new Map(rows.map((r) => [r.id, r]));
    }

    count() {
        return this.#rows.size;
    }

    get(pk, { using = null, multiple = false } = {}) {

        if (typeof pk === 'object' && pk) {

            if (using) {
                const result = multiple ? [] : null;

                const q = Object.entries(pk);
                for (const row of this.#rows.values()) {
                    if (q.every(([k, v]) => row[k] === v)) {
                        if (multiple) result.push(row);
                        else return row;
                    }
                }

                return result;
            }

            if (!('id' in pk))
                throw new Error('Missing primary key field "id"');

            pk = pk.id;
        }
        
        if (typeof pk !== 'number')
            throw new Error(`Bootstrap primary key value must be of type number. ${pk} received`);

        return this.#rows.get(pk);
    }

    getAll() {
        return [...this.#rows.values()];
    }
}