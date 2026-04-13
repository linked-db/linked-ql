import { FirstUpdaterWins } from './concurrency/FirstUpdaterWins.js';
import { FirstCommitterWins } from './concurrency/FirstCommitterWins.js';
import { SerializableStrategy } from './concurrency/SerializableStrategy.js';
import { Transaction } from './Transaction.js';

export class MVCCEngine {

    #txIdCounter = 1;
    #commitCounter = 0;
    #txRegistry = new Map;

    get txRegistry() { return this.#txRegistry; }

    begin({ strategySpec = 'first_updater_wins', meta = null, parentTx = null } = {}) {
        const id = this.#txIdCounter++;
        const snapshot = this.#commitCounter;

        const strategy =
            strategySpec === 'first_committer_wins'
                ? new FirstCommitterWins(this)
                : (strategySpec === 'serializable'
                    ? new SerializableStrategy(this)
                    : (strategySpec === 'first_updater_wins'
                        ? new FirstUpdaterWins(this)
                        : null));
        if (!strategy) throw new Error(`Invalid strategy specifier ${strategySpec}`);

        const tx = new Transaction({ storageEngine: this, id, snapshot, strategy, meta, parentTx });

        this.#txRegistry.set(id, {
            strategy: strategySpec,
            state: 'active',
            commitTime: null,
            tx
        });

        return tx;
    }

    async commit(tx) {
        const meta = this.#txRegistry.get(tx.id);
        if (!meta || meta.state !== 'active') {
            throw new Error('Invalid transaction state');
        }

        tx.validate();

        for (const fn of tx._finallizeLog) {
            await fn();
        }

        this.#commitCounter++;
        meta.state = 'committed';
        meta.commitTime = this.#commitCounter;
    }

    async rollback(tx) {
        const meta = this.#txRegistry.get(tx.id);
        if (!meta || meta.state !== 'active') return;

        meta.state = 'aborted';

        for (let i = tx._undoLog.length - 1; i >= 0; i--) {
            await tx._undoLog[i]();
        }
    }

    txMeta(id) {
        return this.#txRegistry.get(id);
    }

    getOldestActiveSnapshot() {
        let min = Infinity;
        for (const meta of this.#txRegistry.values()) {
            if (meta.state === 'active') {
                if (meta.tx.snapshot < min) {
                    min = meta.tx.snapshot;
                }
            }
        }
        return min === Infinity ? this.#commitCounter : min;
    }

    get commitCounter() {
        return this.#commitCounter;
    }
}
