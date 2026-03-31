import { expect } from 'chai';

import '../src/lang/index.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { EdgeClient } from '../src/clients/edge/EdgeClient.js';
import { EdgeWorker } from '../src/clients/edge/EdgeWorker.js';

const toNdjsonResponse = async (iterable) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                for await (const row of iterable) {
                    controller.enqueue(encoder.encode(`${JSON.stringify(row)}\n`));
                }
                controller.close();
            } catch (e) {
                controller.error(e);
            }
        }
    });

    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
};

describe('EdgeClient <-> EdgeWorker integration (HTTP transport)', () => {
    let db;
    let worker;
    let edge;
    let handleCalls;

    beforeEach(async () => {
        db = new FlashQL();
        await db.connect();
        await db.query(`
            CREATE TABLE public.edge_users (
                id INT PRIMARY KEY,
                name TEXT
            );
            INSERT INTO public.edge_users (id, name) VALUES (1, 'Ada'), (2, 'Linus');
        `);

        worker = new EdgeWorker({ db, type: 'http', rowsStreaming: false });
        handleCalls = [];

        edge = new EdgeClient({
            url: '/edge-http',
            rowsStreaming: false,
            fetchApi: async (url, init) => {
                const op = new URL(url, 'http://localhost').searchParams.get('op');
                const args = JSON.parse(init.body);
                handleCalls.push(op);

                const out = await worker.handle(op, args);

                if (out && typeof out[Symbol.asyncIterator] === 'function') {
                    return await toNdjsonResponse(out);
                }

                return new Response(JSON.stringify(out ?? {}), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        });
    });

    afterEach(async () => {
        await db.disconnect();
    });

    it('routes query through EdgeWorker.handle', async () => {
        const result = await edge.query('SELECT id, name FROM public.edge_users ORDER BY id');

        expect(result.rows).to.deep.eq([
            { id: 1, name: 'Ada' },
            { id: 2, name: 'Linus' },
        ]);
        expect(handleCalls).to.include('query');
    });

    it('routes stream through EdgeWorker.handle and yields rows', async () => {
        const iterable = await edge.stream('SELECT id, name FROM public.edge_users ORDER BY id');
        const out = [];
        for await (const row of iterable) out.push(row);

        expect(out).to.deep.eq([
            { id: 1, name: 'Ada' },
            { id: 2, name: 'Linus' },
        ]);
        expect(handleCalls).to.include('stream');
    });

    it('executes transaction end-to-end with tx token passed to client.query(..., { tx })', async () => {
        await edge.transaction(async (tx) => {
            await edge.query(`INSERT INTO public.edge_users (id, name) VALUES (3, 'Grace')`, { tx });
            await edge.query(`UPDATE public.edge_users SET name = 'Grace Hopper' WHERE id = 3`, { tx });
        });

        const verify = await edge.query('SELECT id, name FROM public.edge_users WHERE id = 3');
        expect(verify.rows).to.deep.eq([{ id: 3, name: 'Grace Hopper' }]);

        expect(handleCalls).to.include('transaction:begin');
        expect(handleCalls).to.include('transaction:commit');
    });

    it('rolls back transaction end-to-end when callback throws', async () => {
        let failed = false;
        try {
            await edge.transaction(async (tx) => {
                await edge.query(`INSERT INTO public.edge_users (id, name) VALUES (4, 'Temp')`, { tx });
                throw new Error('force rollback');
            });
        } catch {
            failed = true;
        }

        expect(failed).to.eq(true);

        const verify = await edge.query('SELECT id, name FROM public.edge_users WHERE id = 4');
        expect(verify.rows).to.deep.eq([]);
        expect(handleCalls).to.include('transaction:rollback');
    });
});
