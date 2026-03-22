import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { EdgeClient } from '../src/clients/edge/EdgeClient.js';

const ndjsonResponse = (rows) => {
    const payload = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(payload));
            controller.close();
        },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
};

const opFromUrl = (url) => new URL(url, 'http://localhost').searchParams.get('op');

describe('EdgeClient - Exhaustive (HTTP)', () => {
    it('rejects missing url', () => {
        expect(() => new EdgeClient({})).to.throw('No url specified');
    });

    it('rejects invalid type', () => {
        expect(() => new EdgeClient({ url: '/x', type: 'invalid' })).to.throw('Invalid type');
    });

    it('accepts worker/shared_worker constructor types with stubs', () => {
        const OriginalWorker = globalThis.Worker;
        const OriginalSharedWorker = globalThis.SharedWorker;
        try {
            globalThis.Worker = class extends EventTarget { postMessage() {} };
            globalThis.SharedWorker = class { constructor() { return new (class extends EventTarget { postMessage() {} })(); } };

            expect(() => new EdgeClient({ url: '/w.js', type: 'worker' })).to.not.throw();
            expect(() => new EdgeClient({ url: '/sw.js', type: 'shared_worker' })).to.not.throw();
        } finally {
            globalThis.Worker = OriginalWorker;
            globalThis.SharedWorker = OriginalSharedWorker;
        }
    });

    it('executes non-live query and returns Result', async () => {
        const client = new EdgeClient({
            url: '/db',
            fetchApi: async () => new Response(JSON.stringify({ rows: [{ id: 1 }] }), {
                headers: { 'Content-Type': 'application/json' },
            }),
        });

        const result = await client.query('SELECT 1');
        expect(result.rows).to.deep.eq([{ id: 1 }]);
    });

    it('supports transaction wrapper over HTTP transport', async () => {
        let committed = false;
        let rolledBack = false;

        const client = new EdgeClient({
            url: '/db',
            fetchApi: async (url, init) => {
                const op = opFromUrl(url);
                const args = JSON.parse(init.body);

                if (op === 'transaction:begin') {
                    return new Response(JSON.stringify({ id: 'tx-http-1' }), { headers: { 'Content-Type': 'application/json' } });
                }
                if (op === 'transaction:commit') {
                    committed = true;
                    expect(args.id).to.eq('tx-http-1');
                    return new Response(JSON.stringify(true), { headers: { 'Content-Type': 'application/json' } });
                }
                if (op === 'transaction:rollback') {
                    rolledBack = true;
                    return new Response(JSON.stringify(true), { headers: { 'Content-Type': 'application/json' } });
                }
                if (op === 'query') {
                    return new Response(JSON.stringify({ rows: [{ tx: args.options.tx }] }), { headers: { 'Content-Type': 'application/json' } });
                }

                return new Response(JSON.stringify({ rows: [] }), { headers: { 'Content-Type': 'application/json' } });
            },
        });

        const txId = await client.transaction(async (tx) => {
            const res = await tx.query('SELECT 1');
            return res.rows[0].tx;
        });

        expect(txId).to.eq('tx-http-1');
        expect(committed).to.eq(true);
        expect(rolledBack).to.eq(false);
    });

    it('rolls back transaction wrapper over HTTP transport when callback throws', async () => {
        let committed = false;
        let rolledBack = false;

        const client = new EdgeClient({
            url: '/db',
            fetchApi: async (url) => {
                const op = opFromUrl(url);
                if (op === 'transaction:begin') {
                    return new Response(JSON.stringify({ id: 'tx-http-2' }), { headers: { 'Content-Type': 'application/json' } });
                }
                if (op === 'transaction:commit') {
                    committed = true;
                    return new Response(JSON.stringify(true), { headers: { 'Content-Type': 'application/json' } });
                }
                if (op === 'transaction:rollback') {
                    rolledBack = true;
                    return new Response(JSON.stringify(true), { headers: { 'Content-Type': 'application/json' } });
                }
                return new Response(JSON.stringify({ rows: [] }), { headers: { 'Content-Type': 'application/json' } });
            },
        });

        await expect(client.transaction(async () => {
            throw new Error('tx error');
        })).to.be.rejectedWith('tx error');

        expect(committed).to.eq(false);
        expect(rolledBack).to.eq(true);
    });

    const streamCases = Array.from({ length: 48 }, (_, i) => i + 1);
    for (const seed of streamCases) {
        it(`streams ndjson payload #${seed}`, async () => {
            const rows = [
                { id: seed, group: 'a' },
                { id: seed + 1000, group: 'b' },
            ];

            const client = new EdgeClient({
                url: '/db',
                rowsStreaming: false,
                fetchApi: async (url) => {
                    const op = opFromUrl(url);
                    if (op === 'stream') return ndjsonResponse(rows);
                    return new Response(JSON.stringify({ rows: [] }), { headers: { 'Content-Type': 'application/json' } });
                },
            });

            const iterable = await client.stream('SELECT * FROM t');
            const out = [];
            for await (const row of iterable) out.push(row);

            expect(out).to.deep.eq(rows);
        });
    }

    const queryCases = Array.from({ length: 24 }, (_, i) => i + 1);
    for (const seed of queryCases) {
        it(`passes query payload #${seed}`, async () => {
            const seen = [];
            const client = new EdgeClient({
                url: '/db',
                fetchApi: async (url, init) => {
                    const op = opFromUrl(url);
                    seen.push([op, JSON.parse(init.body)]);
                    return new Response(JSON.stringify({ rows: [{ seed }] }), {
                        headers: { 'Content-Type': 'application/json' },
                    });
                },
            });

            const result = await client.query(`SELECT ${seed}`, { values: [seed], prepared: `p_${seed}` });
            expect(result.rows).to.deep.eq([{ seed }]);
            expect(seen[0][0]).to.eq('query');
            expect(seen[0][1].query).to.eq(`SELECT ${seed}`);
            expect(seen[0][1].options.values).to.deep.eq([seed]);
        });
    }
});
