import { SimpleEmitter } from '../../clients/abstracts/SimpleEmitter.js';

export class LinkedQlWalSub extends SimpleEmitter {

    #receiver;

    #aborted = false;
    #abortCalled = false;

    get aborted() { return this.#aborted; }
    get _abortCalled() { return this.#abortCalled; }

    constructor(receiver) {
        super();    
        this.#receiver = receiver;
    }

    async abort({ forget = false } = {}) {
        this.#abortCalled = true;
        const returnValue = await this.#receiver({ forget });
        this.#aborted = true;
        return returnValue;
    }
}
