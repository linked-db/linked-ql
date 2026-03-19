export class ConcurrencyStrategy {

    #engine;
    get engine() { return this.#engine; }

    constructor(engine) {
        this.#engine = engine;
    }

    setXMIN(version, xmin) {
        return Object.defineProperty(version, 'XMIN', { value: xmin, writable: true });
    }

    matchXMIN(version, xmin) {
        return version.XMIN === xmin;
    }

    setXMAX(version, xmax) {
        return this.resetXMAX(version, xmax);
    }

    resetXMAX(version, xmax) {
        return Object.defineProperty(version, 'XMAX', { value: xmax, writable: true });
    }

    matchXMAX(version, xmax) {
        // if not 0, v.XMAX CAN BE an array
        // on transactions with strategy === FirstCommitterWins
        if (Array.isArray(version.XMAX)) {
            return version.XMAX.includes(xmax);
        }
        return version.XMAX === xmax;
    }

    getWriteLocker(tx, version) {
        // Fail eagerly
        if (version.XMAX !== 0 && !this.matchXMAX(version, tx.id)) {
            // if not 0, v.XMAX CAN BE an array
            // on transactions with strategy === FirstCommitterWins
            for (const xmax of [].concat(version.XMAX)) {
                const meta = this.engine.txMeta(xmax);
                if (meta && (meta.state === 'active' || meta.state === 'committed')) {
                    return meta;
                }
            }
        }
    }

    onRead(tx, version, pk) { }
    onWrite(tx, version, pk) { }
    onInsert(tx, version, pk) { }
    onPredicateRead(tx, entry) { }
    validate(tx) { }
}
