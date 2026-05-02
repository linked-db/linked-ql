import { MessagePortPlus } from '@webqit/port-plus';

export class EdgeHttpHandler {

    #edgeWorker;
    get edgeWorker() { return this.#edgeWorker; }

    constructor(edgeWorker) {
        this.#edgeWorker = edgeWorker;
    }

    async handle(event) {
        if (!(event.request instanceof Request))
            throw new Error(`event.request must be a standard request object`);
        if (event.client && !(event.client instanceof MessagePortPlus))
            throw new Error(`event.client must be a MessagePortPlus interface`);
        if (event.respondWith && !(typeof event.respondWith === 'function'))
            throw new Error(`event.respondWith must be a function`);
        if (event.waitUntil && !(typeof event.waitUntil === 'function'))
            throw new Error(`event.waitUntil must be a function`);

        const op = new URL(event.request.url).searchParams.get('op');
        const args = await event.request.json();

        let result;
        try {
            result = await this.#edgeWorker.handle(op, args, event.client, (promise) => {
                if (event.waitUntil) {
                    event.waitUntil(promise);
                } else {
                    promise.then(() => event.client.close());
                }
            }) || {}; // Always return something to prevent being a 404
        } catch (error) {
            result = {
                __error: {
                    name: error?.name || 'Error',
                    message: error?.message || String(error),
                    stack: error?.stack || null,
                }
            };
        }

        if (event.respondWith) {
            await event.respondWith(result);
        } else return result;
    }
}