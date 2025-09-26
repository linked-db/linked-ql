import { Result } from '../Result.js';
import Observer from '@webqit/observer';

export class RealtimeResult extends Result {

    #$rows;
    #hashes
    get hashes() { return this.#hashes; }

    #abort
    
    constructor({ rows = [], hashes = [], abort = () => undefined, signal = undefined } = {}) {
        super({ rows });
        this.#$rows = Observer.proxy(rows);
        this.#hashes = hashes;
        this.#abort = abort;
        if (signal) {
            signal.addEventListener('abort', () => this.abort());
        }
    }

    abort() { this.#abort(); }

    _render(event) {
        // Update...
        if (event.type === 'update') {
            const i = this.#hashes.indexOf(event.oldHash);
            if (i > -1) {
                Observer.set(this.#$rows[i], event.new, { diff: true });
                this.#hashes[i] = event.newHash;
            } else {
                // Converts to an insert
                event = { ...event, type: 'insert' };
            }
        }
        // Insert...
        if (event.type === 'insert') {
            this.#$rows.push(event.new);
            this.#hashes.push(event.newHash);
        } else if (event.type === 'delete') {
            // Delete...
            const i = this.#hashes.indexOf(event.oldHash);
            if (i > -1) {
                this.#$rows.splice(i, 1);
                this.#hashes.splice(i, 1);
            }
        }
    }
}