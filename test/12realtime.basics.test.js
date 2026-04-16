import { expect } from 'chai';

import '../src/lang/index.js';
import { FlashQL } from '../src/flashql/FlashQL.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, { timeoutMs = 1000, stepMs = 10 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (predicate()) return;
        await sleep(stepMs);
    }
    throw new Error('Timed out waiting for condition');
}

describe('Realtime - Basics', () => {
    let client;

    beforeEach(async () => {
        client = new FlashQL();
        await client.connect();
    });

    afterEach(async () => {
        await client.disconnect();
    });

    it('emits insert/update/delete commits via wal subscriptions', async () => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.rt_events (
                id INT PRIMARY KEY,
                name TEXT
            )
        `);

        const events = [];
        const unsubscribe = await client.wal.subscribe((commit) => events.push(commit));

        const tx1 = client.storageEngine.begin();
        const table1 = tx1.getRelation({ namespace: 'public', name: 'rt_events' });
        await table1.insert({ id: 10, name: 'John' });
        await tx1.commit();

        const tx2 = client.storageEngine.begin();
        const table2 = tx2.getRelation({ namespace: 'public', name: 'rt_events' });
        await table2.update({ id: 10 }, { id: 10, name: 'John Doe' });
        await tx2.commit();

        const tx3 = client.storageEngine.begin();
        const table3 = tx3.getRelation({ namespace: 'public', name: 'rt_events' });
        await table3.delete({ id: 10 });
        await tx3.commit();

        await waitFor(() => events.length >= 3);

        expect(events.slice(-3).map((c) => c.entries[0].op)).to.deep.eq(['insert', 'update', 'delete']);
        expect(events[events.length - 3].entries[0].relation).to.deep.include({ namespace: 'public', name: 'rt_events' });
        expect(events[events.length - 2].entries[0]).to.deep.include({ op: 'update' });
        expect(events[events.length - 1].entries[0]).to.deep.include({ op: 'delete' });

        await unsubscribe();
    });

    it('filters wal subscriptions by selector', async () => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.rt_a (
                id INT PRIMARY KEY,
                name TEXT
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.rt_b (
                id INT PRIMARY KEY,
                name TEXT
            )
        `);

        const all = [];
        const onlyA = [];
        const onlyB = [];

        const offAll = await client.wal.subscribe((commit) => all.push(commit));
        const offA = await client.wal.subscribe({ public: ['rt_a'] }, (commit) => onlyA.push(commit));
        const offB = await client.wal.subscribe({ public: ['rt_b'] }, (commit) => onlyB.push(commit));

        const tx = client.storageEngine.begin();
        const a = tx.getRelation({ namespace: 'public', name: 'rt_a' });
        const b = tx.getRelation({ namespace: 'public', name: 'rt_b' });
        await a.insert({ id: 1, name: 'A1' });
        await b.insert({ id: 1, name: 'B1' });
        await tx.commit();

        await waitFor(() => all.length && onlyA.length && onlyB.length);

        expect(all[0].entries).to.have.length(2);
        expect(onlyA[0].entries).to.have.length(1);
        expect(onlyB[0].entries).to.have.length(1);
        expect(onlyA[0].entries[0].relation.name).to.eq('rt_a');
        expect(onlyB[0].entries[0].relation.name).to.eq('rt_b');

        await offAll();
        await offA();
        await offB();
    });

    it('supports subscribing to table-mapped non-replication views through wal.subscribe()', async () => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.rt_view_src (
                id INT PRIMARY KEY,
                name TEXT
            )
        `);
        await client.query(`
            CREATE VIEW public.rt_view_plain AS
            TABLE public.rt_view_src
        `);

        const commits = [];
        const unsubscribe = await client.wal.subscribe({ public: ['rt_view_plain'] }, (commit) => commits.push(commit));

        await client.query(`INSERT INTO public.rt_view_src (id, name) VALUES (1, 'Ada')`);
        await waitFor(() => commits.length > 0);

        expect(commits[0].entries).to.have.length(1);
        expect(commits[0].entries[0]).to.deep.include({
            op: 'insert',
            relation: { namespace: 'public', name: 'rt_view_plain', keyColumns: ['id'] },
        });
        expect(commits[0].entries[0].new).to.deep.eq({ id: 1, name: 'Ada' });

        await unsubscribe();
    });

    it('rewrites diffable live-query view commits as wal commits', async () => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.rt_view_derived_src (
                id INT PRIMARY KEY,
                name TEXT
            )
        `);
        await client.query(`
            CREATE VIEW public.rt_view_derived AS
            SELECT id AS id_derived, name AS name_derived
            FROM public.rt_view_derived_src
            WHERE id > 0
        `);

        const commits = [];
        const unsubscribe = await client.wal.subscribe({ public: ['rt_view_derived'] }, (commit) => commits.push(commit));

        await client.query(`INSERT INTO public.rt_view_derived_src (id, name) VALUES (1, 'Ada')`);
        await waitFor(() => commits.length > 0);

        expect(commits[0].type).to.eq(undefined);
        expect(commits[0].entries).to.have.length(1);
        expect(commits[0].entries[0]).to.deep.eq({
            op: 'insert',
            old: null,
            new: { id_derived: 1, name_derived: 'Ada' },
            relation: { namespace: 'public', name: 'rt_view_derived', keyColumns: ['id_derived'] },
        });

        await client.query(`UPDATE public.rt_view_derived_src SET name = 'Grace' WHERE id = 1`);
        await waitFor(() => commits.length > 1);

        expect(commits[1].type).to.eq(undefined);
        expect(commits[1].entries[0]).to.deep.eq({
            op: 'update',
            old: null,
            new: { id_derived: 1, name_derived: 'Grace' },
            relation: { namespace: 'public', name: 'rt_view_derived', keyColumns: ['id_derived'] },
        });

        await unsubscribe();
    });

    it('passes through non-diffable live-query view commits as-is', async () => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.rt_view_aggregate_src (
                id INT PRIMARY KEY,
                name TEXT
            )
        `);
        await client.query(`
            CREATE VIEW public.rt_view_aggregate AS
            SELECT COUNT(*) AS total_rows
            FROM public.rt_view_aggregate_src
        `);

        const commits = [];
        const unsubscribe = await client.wal.subscribe({ public: ['rt_view_aggregate'] }, (commit) => commits.push(commit));

        await client.query(`INSERT INTO public.rt_view_aggregate_src (id, name) VALUES (1, 'Ada')`);
        await waitFor(() => commits.some((commit) => commit.type === 'result'));

        const resultCommit = commits.find((commit) => commit.type === 'result');
        expect(resultCommit.rows).to.deep.eq([{ total_rows: 1 }]);
        expect(resultCommit.hashes).to.have.length(1);

        await unsubscribe();
    });

    it('streams query diffs in live mode', async () => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.rt_live (
                id INT PRIMARY KEY,
                name TEXT
            )
        `);
        await client.query(`
            INSERT INTO public.rt_live (id, name)
            VALUES (1, 'One'), (2, 'Two')
        `);

        const commits = [];
        const result = await client.query(
            `SELECT id, name FROM public.rt_live WHERE id > 1 ORDER BY id`,
            (commit) => commits.push(commit),
            { live: true }
        );

        expect(result.rows).to.deep.eq([{ id: 2, name: 'Two' }]);
        expect(result.mode).to.eq('callback');

        await client.query(`INSERT INTO public.rt_live (id, name) VALUES (3, 'Three')`);
        await waitFor(() => commits.some((c) => c.type === 'diff' && c.entries.some((e) => e.op === 'insert' && e.new?.id === 3)));

        await client.query(`UPDATE public.rt_live SET name = 'Three+' WHERE id = 3`);
        await waitFor(() => commits.some((c) => c.type === 'diff' && c.entries.some((e) => e.op === 'update' && e.new?.name === 'Three+')));

        await client.query(`DELETE FROM public.rt_live WHERE id = 3`);
        await waitFor(() => commits.some((c) => c.type === 'diff' && c.entries.some((e) => e.op === 'delete')));

        await result.abort();
    });
});
