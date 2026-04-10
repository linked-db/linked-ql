import { MessagePortPlus } from '@webqit/port-plus';

export class EdgeWebWorkerRuntime {

    #edgeWorker;
    get edgeWorker() { return this.#edgeWorker; }

    constructor(edgeWorker) {
        this.#edgeWorker = edgeWorker;
    }

    async handle(...args) {
        return await this.#edgeWorker.handle(...args);
    }

    runIn(worker) {
        MessagePortPlus.upgradeInPlace(worker);
        worker.addRequestListener('message', async (e) => {
            const { data: { op, args }, ports: [port] } = e;
            try {
                await this.#edgeWorker.handle(op, args, port);
            } catch (error) {
                port?.postMessage({
                    __error: {
                        name: error?.name || 'Error',
                        message: error?.message || String(error),
                        stack: error?.stack || null,
                    }
                });
            }
        });
    }
}