import { expect } from 'chai';
import { MessagePortPlus } from '@webqit/port-plus';

import '../src/lang/index.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { EdgeWorker } from '../src/clients/edge/EdgeWorker.js';

const waitForEvent = (target, type, { timeout = 1000 } = {}) => {
    return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error(`Timeout waiting for event: ${type}`)), timeout);
        target.addEventListener(type, (e) => {
            clearTimeout(to);
            resolve(e.data);
        }, { once: true });
    });
};

const createChannel = () => {
    const { port1, port2 } = new MessageChannel();
    MessagePortPlus.upgradeInPlace(port1);
    MessagePortPlus.upgradeInPlace(port2);
    return { serverPort: port1, clientPort: port2 };
};

describe('EdgeWorker integration (Port+ transport)', () => {
    let db;
    let worker;

    beforeEach(async () => {
        db = new FlashQL();
        await db.connect();
        await db.query(`
            CREATE TABLE public.edge_port_users (
                id INT PRIMARY KEY,
                name TEXT
            );
            INSERT INTO public.edge_port_users (id, name) VALUES (1, 'Ada'), (2, 'Linus');
        `);

        worker = new EdgeWorker({ db, type: 'worker', rowsStreaming: 'port' });
    });

    afterEach(async () => {
        await db.disconnect();
    });

    it('streams rows over port and honors client backpressure signals', async () => {
        const { serverPort, clientPort } = createChannel();

        await worker.handle('stream', {
            query: 'SELECT id, name FROM public.edge_port_users ORDER BY id',
            options: { batchSize: 1 },
        }, serverPort);

        const first = await waitForEvent(clientPort, 'lnkd_result');
        expect(first.rows).to.deep.eq([{ id: 1, name: 'Ada' }]);
        expect(first.done).to.eq(false);

        clientPort.postMessage('next', { type: 'ctrl' });
        const second = await waitForEvent(clientPort, 'lnkd_result');
        expect(second.rows).to.deep.eq([{ id: 2, name: 'Linus' }]);
        expect(second.done).to.eq(false);

        clientPort.postMessage('next', { type: 'ctrl' });
        const end = await waitForEvent(clientPort, 'lnkd_result');
        expect(end.rows).to.deep.eq([]);
        expect(end.done).to.eq(true);

        await clientPort.close();
    });

    it('emits live query commits over lnkd_commit events and supports forget()', async () => {
        const { serverPort, clientPort } = createChannel();

        await worker.handle('query', {
            query: 'SELECT id, name FROM public.edge_port_users ORDER BY id',
            options: { live: true, callback: true, id: 'edge_live_slot' },
        }, serverPort);

        const first = await waitForEvent(clientPort, 'message');
        expect(first.rows).to.deep.eq([
            { id: 1, name: 'Ada' },
            { id: 2, name: 'Linus' },
        ]);

        await db.query(`INSERT INTO public.edge_port_users (id, name) VALUES (3, 'Grace')`);

        const commitEvent = await waitForEvent(clientPort, 'lnkd_commit');
        expect(['diff', 'result']).to.include(commitEvent.commit?.type);

        const forgot = await new Promise((resolve) => {
            clientPort.postRequest(null, (e) => resolve(e.data), { once: true, type: 'forget' });
        });
        expect(forgot).to.eq(true);

        await clientPort.close();
    });

    it('emits wal subscription commits over lnkd_commit and supports wal:forget', async () => {
        const { serverPort, clientPort } = createChannel();

        await worker.handle('wal:subscribe', {
            selector: { public: ['edge_port_users'] },
            options: { id: 'edge_sync_slot' },
        }, serverPort);

        await db.query(`INSERT INTO public.edge_port_users (id, name) VALUES (4, 'Ken')`);

        const commitEvent = await waitForEvent(clientPort, 'lnkd_commit');
        expect(commitEvent.commit?.entries?.[0]?.relation).to.deep.include({ namespace: 'public', name: 'edge_port_users' });

        const forgotten = await worker.exec('wal:forget', { id: 'edge_sync_slot' });
        expect(forgotten).to.eq(true);

        await clientPort.close();
    });
});
