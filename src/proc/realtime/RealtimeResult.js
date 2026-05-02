import { Observer } from '@webqit/observer';
import { SimpleEmitter } from '../../clients/abstracts/SimpleEmitter.js';
import { Result } from '../../clients/Result.js';
import { _eq } from '../../lang/abstracts/util.js';

export class RealtimeResult extends SimpleEmitter {

    #rows
    #hashes;
    #receiver;
    #initial;
    #mode;
    #strategy;

    #aborted = false;
    #abortCalled = false;

    get rows() { return this.#rows; }
    get hashes() { return this.#hashes; }
    get initial() { return this.#initial; }
    get mode() { return this.#mode; }
    get strategy() { return this.#strategy; }

    get aborted() { return this.#aborted; }
    get _abortCalled() { return this.#abortCalled; }
    
    constructor({ rows = [], hashes = [], initial = true, mode = 'live', strategy = {} } = {}, receiver = (() => undefined), signal = undefined) {
        super();

        this.#rows = rows;
        this.#hashes = hashes;
        this.#initial = initial;
        this.#mode = mode;
        this.#strategy = strategy;

        this.#receiver = receiver;
        if (signal) signal.addEventListener('abort', () => this.abort());
    }

    async _apply(commit) {
        const Obs = Observer;
        const $rows = Obs.proxy(this.rows);
        const $hashes = Obs.proxy(this.hashes);

        if (commit.type === 'diff') {
            Obs.batch(this.rows, () => {
                for (let event of commit.entries) {
                    if (event.op === 'update') {
                        const i = this.#hashes.indexOf(event.oldHash);
                        if (i > -1) {
                            Obs.set(this.rows[i], event.new, { diff: true });
                            $hashes[i] = event.newHash;
                        } else {
                            event = { ...event, op: 'insert' };
                        }
                    }
                    if (event.op === 'insert') {
                        $rows.push(Object.assign(Object.create(null), event.new));
                        $hashes.push(event.newHash);
                    }
                    if (event.op === 'delete') {
                        const i = this.#hashes.indexOf(event.oldHash);
                        if (i > -1) {
                            $rows.splice(i, 1);
                            $hashes.splice(i, 1);
                        }
                    }
                }
            });
        }

        if (commit.type === 'swap') {
            Obs.batch(this.rows, () => {
                const _rows = this.rows.slice(0);
                const _hashes = this.#hashes.slice(0);
                for (const [hash, targetHash] of commit.entries) {
                    const i_a = _hashes.indexOf(hash);
                    const i_b = _hashes.indexOf(targetHash);
                    $rows[i_b] = _rows[i_a];
                    $hashes[i_b] = hash;
                }
            });
        }

        if (commit.type === 'result') {
            $hashes.splice(0);
            $hashes.push(...commit.hashes);

            Obs.batch(this.rows, () => {
                const maxLen = Math.max(this.rows.length, commit.rows.length);
                for (let i = 0; i < maxLen; i ++) {
                    if (!commit.rows[i]) {
                        $rows.splice(i);
                        break;
                    }
                    if (!_eq(commit.rows[i], this.rows[i])) {
                        $rows[i] = commit.rows[i];
                    }
                }
            });
        }
    }

    async abort({ forget = false } = {}) {
        this.#abortCalled = true;
        const returnValue = await this.#receiver({ forget });
        this.#aborted = true;
        return returnValue;
    }

    jsonfy() { return this.toJSON(); }

    toJSON() {
        return {
            rows: this.rows,
            hashes: this.#hashes,
            initial: this.#initial,
            mode: this.#mode,
        };
    }
}
