import { ConcurrencyStrategy } from './ConcurrencyStrategy.js';

export class FirstCommitterWins extends ConcurrencyStrategy {

    get name() { return 'first_committer_wins'; }

    setXMAX(version, xmax) {
        if (typeof version.XMAX === 'number'
            && version.XMAX !== 0
            && version.XMAX !== xmax) {
            return Object.defineProperty(version, 'XMAX', { value: [version.XMAX, xmax], writable: true });
        }
        if (Array.isArray(version.XMAX)) {
            if (!version.XMAX.includes(xmax)) {
                version.XMAX.push(xmax);
            }
            return;
        }
        return Object.defineProperty(version, 'XMAX', { value: xmax, writable: true });
    }

    onRead(tx, version, pk) {
        tx._readVersions.add(version);
        tx._readKeys.add(pk);
    }

    onWrite(tx, version, pk) {
        const locker = this.getWriteLocker(tx, version);
        if (locker && locker.strategy !== this.name) {
            throw new Error('Write conflict');
        }
        tx._writeVersions.add(version);
        tx._writeKeys.add(pk);
    }

    validate(tx) {
        for (const version of tx._writeVersions) {
            // Versions created by this tx (e.g. INSERT) have no competing writer claim.
            if (version.XMIN === tx.id) continue;

            if (!this.matchXMAX(version, tx.id)) {
                throw new Error('Commit-time write conflict');
            }
            // This committer claims XMAX
            // other pending committers in the XMAX list lose
            if (Array.isArray(version.XMAX)) {
                version.XMAX.splice(0);
            }
            this.resetXMAX(version, tx.id);
        }

        for (const version of tx._readVersions) {
            if (version.XMAX !== 0) {
                for (const xmax of [].concat(version.XMAX)) {
                    const meta = this.engine.txMeta(xmax);
                    if (
                        meta &&
                        meta.state === 'committed' &&
                        meta.commitTime > tx.snapshot
                    ) {
                        throw new Error('Commit-time read conflict');
                    }
                }
            }
        }
    }
}
