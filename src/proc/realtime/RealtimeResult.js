import { _eq } from '../../lang/abstracts/util.js';
import { Result } from '../../entry/Result.js';

export class RealtimeResult extends Result {

    #hashes;
    #abortLine;

    get hashes() { return this.#hashes; }
    
    constructor({ rows = [], hashes = [] } = {}, abortLine = (() => undefined), signal = undefined) {
        super({ rows });

        this.#hashes = hashes;

        this.#abortLine = abortLine;
        if (signal) signal.addEventListener('abort', () => this.abort());
    }

    abort() { this.#abortLine(); }

    async _apply(eventName, eventData) {
        const Obs = typeof Observer === 'undefined' 
            ? (await import('@webqit/observer')).default
            : Observer;
        const $rows = Obs.proxy(this.rows);
        if (eventName === 'diff') {
            Obs.batch(this.rows, () => {
                for (let event of eventData) {
                    if (event.type === 'update') {
                        const i = this.#hashes.indexOf(event.oldHash);
                        if (i > -1) {
                            Obs.set(this.rows[i], event.new, { diff: true });
                            this.#hashes[i] = event.newHash;
                        } else {
                            event = { ...event, type: 'insert' };
                        }
                    }
                    if (event.type === 'insert') {
                        $rows.push(event.new);
                        this.#hashes.push(event.newHash);
                    }
                    if (event.type === 'delete') {
                        const i = this.#hashes.indexOf(event.oldHash);
                        if (i > -1) {
                            $rows.splice(i, 1);
                            this.#hashes.splice(i, 1);
                        }
                    }
                }
            });
        }

        if (eventName === 'swap') {
            Obs.batch(this.rows, () => {
                const _rows = this.rows.slice(0);
                const _hashes = this.#hashes.slice(0);
                for (const [hash, targetHash] of eventData) {
                    const i_a = _hashes.indexOf(hash);
                    const i_b = _hashes.indexOf(targetHash);
                    $rows[i_b] = _rows[i_a];
                    this.#hashes[i_b] = hash;
                }
            });
        }

        if (eventName === 'result') {
            this.#hashes = eventData.hashes;
            Obs.batch(this.rows, () => {
                const maxLen = Math.max(this.rows.length, eventData.rows.length);
                for (let i = 0; i < maxLen; i ++) {
                    if (!eventData.rows[i]) {
                        $rows.splice(i);
                        break;
                    }
                    if (!_eq(eventData.rows[i], this.rows[i])) {
                        $rows[i] = eventData.rows[i];
                    }
                }
            });
        }
    }
}