import { expect } from 'chai';

import '../src/lang/index.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { InMemoryKV } from '@webqit/keyval/inmemory';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, { timeoutMs = 1000, stepMs = 10 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await predicate()) return;
        await sleep(stepMs);
    }
    throw new Error('Timed out waiting for condition');
}

describe('SyncManager - FlashQL.sync', () => {
    let client;
    let registry;
    let path;

    beforeEach(async () => {
        registry = new Map();
        path = ['linkedql-sync-manager', String(Math.random()).slice(2)];

        client = new FlashQL({
            keyval: new InMemoryKV({ path, registry }),
            autoSync: false,
        });
        await client.connect();

        await client.query(`CREATE TABLE public.src_users (id INT PRIMARY KEY, name TEXT)`);
        await client.query(`INSERT INTO public.src_users (id, name) VALUES (1, 'Ada')`);

        await client.storageEngine.transaction(async (tx) => {
            await tx.createView({
                namespace: 'public',
                name: 'mv_users',
                persistence: 'materialized',
                view_spec: { namespace: 'public', name: 'src_users' },
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                    { name: 'name', type: 'TEXT' },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
            await tx.createView({
                namespace: 'public',
                name: 'rt_users',
                persistence: 'realtime',
                view_spec: { namespace: 'public', name: 'src_users' },
                columns: [
                    { name: 'id', type: 'INT', not_null: true },
                    { name: 'name', type: 'TEXT' },
                ],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });
    });

    afterEach(async () => {
        await client.disconnect();
    });

    it('sync() materializes selected views and reports synced status', async () => {
        const summary = await client.sync.sync({ public: ['mv_users'] });
        expect(summary.materialized.length).to.eq(1);

        const rows = await client.storageEngine.transaction(async (tx) => {
            return tx.getTable({ namespace: 'public', name: 'mv_users' }).getAll().sort((a, b) => a.id - b.id);
        });
        expect(rows).to.deep.eq([{ id: 1, name: 'Ada' }]);

        const status = await client.sync.status({ public: ['mv_users'] });
        expect(status[0].mode).to.eq('materialized');
        expect(status[0].state).to.eq('synced');
    });

    it('sync() starts realtime jobs, stop() disables, and resume() re-enables', async () => {
        const started = await client.sync.sync({ public: ['rt_users'] });
        expect(started.realtime.length).to.eq(1);

        await client.query(`INSERT INTO public.src_users (id, name) VALUES (2, 'Linus')`);

        await waitFor(async () => {
            const rows = await client.storageEngine.transaction(async (tx) => {
                return tx.getTable({ namespace: 'public', name: 'rt_users' }).getAll();
            });
            return rows.some((r) => r.id === 2);
        });

        const statusA = await client.sync.status({ public: ['rt_users'] });
        expect(statusA[0].state).to.eq('running');

        await client.sync.stop({ public: ['rt_users'] });
        await sleep(30);
        await client.query(`INSERT INTO public.src_users (id, name) VALUES (3, 'Grace')`);
        await sleep(40);

        const rows = await client.storageEngine.transaction(async (tx) => {
            return tx.getTable({ namespace: 'public', name: 'rt_users' }).getAll().sort((a, b) => a.id - b.id);
        });
        expect(rows.map((r) => r.id)).to.deep.eq([1, 2]);

        const statusB = await client.sync.status({ public: ['rt_users'] });
        expect(statusB[0].state).to.eq('idle');
        expect(statusB[0].enabled).to.eq(false);

        await client.sync.sync({ public: ['rt_users'] });
        await sleep(20);
        await client.query(`INSERT INTO public.src_users (id, name) VALUES (4, 'Edsger')`);
        await sleep(40);

        const rowsAfterSync = await client.storageEngine.transaction(async (tx) => {
            return tx.getTable({ namespace: 'public', name: 'rt_users' }).getAll().sort((a, b) => a.id - b.id);
        });
        expect(rowsAfterSync.map((r) => r.id)).to.deep.eq([1, 2]);

        const resumed = await client.sync.resume({ public: ['rt_users'] });
        expect(resumed.resumed.length).to.eq(1);
        const statusC = await client.sync.status({ public: ['rt_users'] });
        expect(statusC[0].enabled).to.eq(true);
        expect(statusC[0].state).to.eq('running');

        await waitFor(async () => {
            const rows = await client.storageEngine.transaction(async (tx) => {
                return tx.getTable({ namespace: 'public', name: 'rt_users' }).getAll().sort((a, b) => a.id - b.id);
            });
            return rows.map((r) => r.id).join(',') === '1,2,3,4';
        });
    });

    it('sync() coalesces overlapping runs into one materialization pass', async () => {
        const originalQuery = client.query.bind(client);
        let materializeCalls = 0;

        client.query = async (...args) => {
            const [querySpec] = args;
            if (querySpec && typeof querySpec === 'object'
                && querySpec.namespace === 'public'
                && querySpec.name === 'src_users') {
                materializeCalls += 1;
                await sleep(40);
            }
            return await originalQuery(...args);
        };

        try {
            const [summaryA, summaryB] = await Promise.all([
                client.sync.sync({ public: ['mv_users'] }),
                client.sync.sync({ public: ['mv_users'] }),
            ]);

            expect(materializeCalls).to.eq(1);
            expect(summaryA.materialized).to.deep.eq(summaryB.materialized);
            expect(summaryA.materialized.length).to.eq(1);
        } finally {
            client.query = originalQuery;
        }
    });

    it('derives schema for reference-based views when columns are omitted', async () => {
        await client.storageEngine.transaction(async (tx) => {
            await tx.createView({
                namespace: 'public',
                name: 'mv_users_derived',
                persistence: 'materialized',
                view_spec: { namespace: 'public', name: 'src_users' },
            });
            await tx.createView({
                namespace: 'public',
                name: 'rt_users_derived',
                persistence: 'realtime',
                view_spec: { namespace: 'public', name: 'src_users' },
            });
        });

        await client.sync.sync({ public: ['mv_users_derived', 'rt_users_derived'] });

        const schemas = await client.storageEngine.transaction(async (tx) => ([
            tx.showView({ namespace: 'public', name: 'mv_users_derived' }, { schema: true }),
            tx.showView({ namespace: 'public', name: 'rt_users_derived' }, { schema: true }),
        ]));

        expect(schemas[0].columns.has('id')).to.eq(true);
        expect(schemas[0].columns.has('name')).to.eq(true);
        expect(schemas[0].keyColumns).to.deep.eq(['id']);

        expect(schemas[1].columns.has('id')).to.eq(true);
        expect(schemas[1].columns.has('name')).to.eq(true);
        expect(schemas[1].keyColumns).to.deep.eq(['id']);
    });
});
