import { MessagePortPlus } from '@webqit/port-plus';

export class EdgeSharededgeWorkerRuntime {

    #edgeWorker;
    get edgeWorker() { return this.#edgeWorker; }

    constructor(edgeWorker) {
        this.#edgeWorker = edgeWorker;
    }

    async handle(...args) {
        return await this.#edgeWorker.handle(...args);
    }

    runIn(worker) {
        worker.addEventListener('connect', (e) => {
            const port = e.ports?.[0];
            if (!port) return;

            MessagePortPlus.upgradeInPlace(port);
            port.addRequestListener('message', async (evt) => {
                const { data: { op, args }, ports: [replyPort] } = evt;
                try {
                    await this.#edgeWorker.handle(op, args, replyPort, (promise) => {
                        promise.then(() => replyPort.close());
                    });
                } catch (error) {
                    replyPort?.postMessage({
                        __error: {
                            name: error?.name || 'Error',
                            message: error?.message || String(error),
                            stack: error?.stack || null,
                        }
                    });
                }
            });
        });
    }
}