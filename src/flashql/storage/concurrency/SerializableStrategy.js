import { FirstCommitterWins } from './FirstCommitterWins.js';

export class SerializableStrategy extends FirstCommitterWins {

    get name() { return 'serializable'; }

    onInsert(tx, version, pk) {
        this.onWrite(tx, version, pk);
    }

    onPredicateRead(tx, entry) {
        tx.recordPredicateRead(entry);
    }

    validate(tx) {
        super.validate(tx);

        for (const otherMeta of this.storageEngine.txRegistry?.values?.() || []) {
            if (!otherMeta || otherMeta.state !== 'committed') continue;
            if (otherMeta.commitTime <= tx.snapshot) continue;

            for (const change of otherMeta.tx._changeLog) {
                for (const pred of tx._predicateReads) {
                    if (change.relation.name !== pred.relation) continue;
                    if (pred.namespace && change.relation.namespace !== pred.namespace) continue;

                    const candidate = change.new || change.old;
                    if (!candidate) continue;

                    if (typeof pred.matches === 'function') {
                        if (pred.matches(candidate)) {
                            throw new Error('Serializable phantom conflict');
                        }
                        continue;
                    }

                    const key = pred.keyExtractor(candidate);
                    if (key >= pred.range.min && key <= pred.range.max) {
                        throw new Error('Serializable phantom conflict');
                    }
                }
            }
        }
    }
}
