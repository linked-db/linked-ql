import { ConcurrencyStrategy } from './ConcurrencyStrategy.js';

export class FirstUpdaterWins extends ConcurrencyStrategy {

    get name() { return 'first_updater_wins'; }

    onWrite(tx, version) {
        if (this.getWriteLocker(tx, version)) {
            throw new Error('Write conflict');
        }
    }
}
