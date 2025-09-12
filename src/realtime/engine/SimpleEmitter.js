export class SimpleEmitter {

    #listeners = new Map;
    #closeCallbacks = new Set;

    on(event, fn) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set);
        }
        this.#listeners.get(event).add(fn);
        return () => {
            this.#listeners.get(event).delete(fn);
            if (!this.#listeners.get(event).size) {
                this.#listeners.delete(event);
                if (!this.#listeners.size) {
                    for (const fn of this.#closeCallbacks) fn();
                    this.#closeCallbacks.clear();
                }
            }
        };
    }

    onClose(fn) { this.#closeCallbacks.add(fn); }

    emit(event, payload) {
        const s = this.#listeners.get(event);
        if (!s) return;
        for (const fn of s) {
            try {
                fn(payload);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('emitter handler error', err);
            }
        }
    }
}
