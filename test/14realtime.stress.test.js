import { expect } from 'chai';

import '../src/lang/index.js';
import { WalEngine } from '../src/proc/timeline/WalEngine.js';
import { RealtimeResult } from '../src/proc/realtime/RealtimeResult.js';
import { FlashQL } from '../src/flashql/FlashQL.js';

const makeEntry = (namespace, name, op = 'insert', id = 1) => ({
    op,
    relation: { namespace, name, keyColumns: ['id'] },
    ...(op === 'insert' ? { new: { id } } : {}),
    ...(op === 'update' ? { old: { id }, new: { id, v: 1 }, oldKey: { id }, newKey: { id } } : {}),
    ...(op === 'delete' ? { old: { id }, oldKey: { id } } : {}),
});

describe('Realtime - Stress', () => {
    describe('WalEngine selector matrix', () => {
        const selectors = [
            '*',
            { public: ['users'] },
            { public: ['posts'] },
            { public: ['*'] },
            { private: ['users'] },
            { ['*']: ['users'] },
        ];
        const relations = [
            ['public', 'users'],
            ['public', 'posts'],
            ['private', 'users'],
            ['private', 'posts'],
        ];

        let idx = 0;
        for (const selector of selectors) {
            for (const [ns, table] of relations) {
                idx += 1;
                it(`selector case #${idx}`, async () => {
                    const wal = new WalEngine({ drainMode: 'never' });
                    const seen = [];
                    await wal.subscribe(selector, (commit) => seen.push(commit));

                    await wal.dispatch({
                        commitTime: 1,
                        entries: [makeEntry(ns, table)],
                    });

                    const shouldMatch =
                        selector === '*'
                        || (selector.public && ns === 'public' && (selector.public.includes('*') || selector.public.includes(table)))
                        || (selector.private && ns === 'private' && (selector.private.includes('*') || selector.private.includes(table)))
                        || (selector['*'] && (selector['*'].includes('*') || selector['*'].includes(table)));

                    expect(!!seen.length).to.eq(!!shouldMatch);
                    if (shouldMatch) {
                        expect(seen[0].entries).to.have.length(1);
                        expect(seen[0].entries[0].relation).to.deep.include({ namespace: ns, name: table });
                    }
                });
            }
        }
    });

    describe('RealtimeResult mutations', () => {
        const seeds = Array.from({ length: 24 }, (_, i) => i + 1);

        for (const seed of seeds) {
            it(`applies diff/update/delete sequence #${seed}`, async () => {
                const rr = new RealtimeResult({
                    rows: [{ id: 1, value: `a${seed}` }, { id: 2, value: `b${seed}` }],
                    hashes: ['h1', 'h2'],
                });

                await rr._apply({
                    type: 'diff',
                    entries: [
                        { op: 'update', oldHash: 'h1', newHash: 'h1', new: { id: 1, value: `x${seed}` } },
                        { op: 'insert', newHash: `h3_${seed}`, new: { id: 3, value: `c${seed}` } },
                    ],
                });

                await rr._apply({
                    type: 'diff',
                    entries: [
                        { op: 'delete', oldHash: 'h2' },
                    ],
                });

                expect(rr.rows).to.deep.eq([{ id: 1, value: `x${seed}` }, { id: 3, value: `c${seed}` }]);
                expect(rr.hashes).to.deep.eq(['h1', `h3_${seed}`]);
            });
        }

        const swapCases = Array.from({ length: 16 }, (_, i) => i + 1);
        for (const seed of swapCases) {
            it(`applies swap commit #${seed}`, async () => {
                const rr = new RealtimeResult({
                    rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
                    hashes: ['a', 'b', 'c'],
                });

                await rr._apply({
                    type: 'swap',
                    entries: [['a', 'c'], ['c', 'a']],
                });

                expect(rr.hashes).to.deep.eq(['c', 'b', 'a']);
                expect(rr.rows.map((r) => r.id)).to.deep.eq([3, 2, 1]);
            });
        }
    });

    describe('FlashQL live integration', () => {
        let client;

        beforeEach(async () => {
            client = new FlashQL();
            await client.connect();
            await client.query(`
                CREATE TABLE public.rt_stress_live (
                    id INT PRIMARY KEY,
                    name TEXT
                )
            `);
            await client.query(`
                INSERT INTO public.rt_stress_live (id, name)
                VALUES (1, 'A'), (2, 'B'), (3, 'C')
            `);
        });

        afterEach(async () => {
            await client.disconnect();
        });

        const filters = [0, 1, 2, 3, 4, 5];
        for (const minId of filters) {
            it(`live stream responds for predicate id > ${minId}`, async () => {
                const commits = [];
                const result = await client.query(
                    `SELECT id, name FROM public.rt_stress_live WHERE id > ${minId} ORDER BY id`,
                    (commit) => commits.push(commit),
                    { live: true }
                );

                expect(result.mode).to.eq('streaming');
                expect(result.rows.every((r) => r.id > minId)).to.eq(true);

                await client.query(`INSERT INTO public.rt_stress_live (id, name) VALUES (10, 'Z')`);
                await new Promise((r) => setTimeout(r, 30));

                expect(commits.some((c) => c.type === 'diff')).to.eq(true);
                await result.abort();
            });
        }

        it('live join query emits updates when joined table changes', async () => {
            await client.query(`CREATE TABLE public.rt_users (id INT PRIMARY KEY, name TEXT)`);
            await client.query(`CREATE TABLE public.rt_posts (id INT PRIMARY KEY, author_id INT, title TEXT)`);
            await client.query(`INSERT INTO public.rt_users (id, name) VALUES (1, 'Ada')`);

            const result = await client.query(
                `
                SELECT u.id, u.name, p.title
                FROM public.rt_users u
                LEFT JOIN public.rt_posts p ON u.id = p.author_id
                ORDER BY u.id
                `,
                { live: true }
            );

            await client.query(`INSERT INTO public.rt_posts (id, author_id, title) VALUES (10, 1, 'Hello')`);
            await new Promise((r) => setTimeout(r, 60));

            expect(result.rows.some((row) => row.title === 'Hello')).to.eq(true);
            await result.abort();
        });

        it('live aggregate query emits recomputed result commits', async () => {
            await client.query(`CREATE TABLE public.rt_posts_aggr (id INT PRIMARY KEY, author_id INT, title TEXT)`);
            await client.query(`INSERT INTO public.rt_posts_aggr (id, author_id, title) VALUES (1, 1, 'A')`);

            const commits = [];
            const result = await client.query(
                `SELECT COUNT(*) AS total_posts FROM public.rt_posts_aggr`,
                (commit) => commits.push(commit),
                { live: true }
            );

            await client.query(`INSERT INTO public.rt_posts_aggr (id, author_id, title) VALUES (2, 1, 'B')`);
            await new Promise((r) => setTimeout(r, 40));

            expect(commits.some((c) => c.type === 'result')).to.eq(true);
            await result.abort();
        });

        it('live aggregate query updates result rows without callback', async () => {
            await client.query(`CREATE TABLE public.rt_posts_aggr_rows (id INT PRIMARY KEY, author_id INT, title TEXT)`);
            await client.query(`INSERT INTO public.rt_posts_aggr_rows (id, author_id, title) VALUES (1, 1, 'A')`);

            const result = await client.query(
                `SELECT COUNT(*) AS total_posts FROM public.rt_posts_aggr_rows`,
                { live: true }
            );
            expect(result.rows[0].total_posts).to.eq(1);

            await client.query(`INSERT INTO public.rt_posts_aggr_rows (id, author_id, title) VALUES (2, 1, 'B')`);
            await new Promise((r) => setTimeout(r, 40));

            expect(result.rows[0].total_posts).to.eq(2);
            await result.abort();
        });

        it('live ORDER BY + LIMIT query revalidates window on higher-ranked insert', async () => {
            await client.query(`CREATE TABLE public.rt_ranked (id INT PRIMARY KEY, score INT)`);
            await client.query(`INSERT INTO public.rt_ranked (id, score) VALUES (1, 10), (2, 20), (3, 30)`);

            const result = await client.query(
                `SELECT id, score FROM public.rt_ranked ORDER BY score DESC LIMIT 2`,
                { live: true }
            );
            expect(result.rows.map((r) => r.id)).to.deep.eq([3, 2]);

            await client.query(`INSERT INTO public.rt_ranked (id, score) VALUES (4, 40)`);
            await new Promise((r) => setTimeout(r, 50));

            expect(result.rows.map((r) => r.id)).to.deep.eq([4, 3]);
            await result.abort();
        });

        it('resumes live query callback stream from persistent slot id after unsubscribe/re-subscribe', async () => {
            await client.query(`CREATE TABLE public.rt_resume (id INT PRIMARY KEY, name TEXT)`);
            await client.query(`INSERT INTO public.rt_resume (id, name) VALUES (1, 'A')`);

            const slotId = 'live_resume_slot';
            const seenA = [];
            const subA = await client.query(
                `SELECT id, name FROM public.rt_resume ORDER BY id`,
                (commit) => seenA.push(commit),
                { live: true, id: slotId }
            );

            await client.query(`INSERT INTO public.rt_resume (id, name) VALUES (2, 'B')`);
            await new Promise((r) => setTimeout(r, 30));
            await subA.abort();

            await client.query(`INSERT INTO public.rt_resume (id, name) VALUES (3, 'C')`);
            await client.query(`INSERT INTO public.rt_resume (id, name) VALUES (4, 'D')`);

            const seenB = [];
            const subB = await client.query(
                `SELECT id, name FROM public.rt_resume ORDER BY id`,
                (commit) => seenB.push(commit),
                { live: true, id: slotId }
            );
            await new Promise((r) => setTimeout(r, 40));

            const seenBJson = JSON.stringify(seenB);
            expect(seenA.length).to.be.greaterThan(0);
            expect(seenB.length).to.be.greaterThan(0);
            expect(seenBJson.includes('"id":3') || seenBJson.includes('"id":4')).to.eq(true);

            await subB.abort({ forget: true });
        });
    });

    describe('WalEngine persistence and catch-up', () => {
        it('truncateForward validates commitTime argument', async () => {
            const wal = new WalEngine({ keyval: new Map(), drainMode: 'never' });
            let err;
            try {
                await wal.truncateForward(-1);
            } catch (e) {
                err = e;
            }
            expect(err?.message).to.include('non-negative integer');

            err = null;
            try {
                await wal.truncateForward(1.5);
            } catch (e) {
                err = e;
            }
            expect(err?.message).to.include('non-negative integer');
        });

        it('truncateForward drops future commits and rewinds slot checkpoints', async () => {
            const keyval = new Map();
            const wal = new WalEngine({ keyval, drainMode: 'never' });

            const off = await wal.subscribe('*', async () => undefined, { id: 'slot_t' });
            await wal.dispatch({ commitTime: 1, entries: [makeEntry('public', 'users', 'insert', 1)] });
            await wal.dispatch({ commitTime: 2, entries: [makeEntry('public', 'users', 'insert', 2)] });
            await wal.dispatch({ commitTime: 3, entries: [makeEntry('public', 'users', 'insert', 3)] });
            await off();

            const result = await wal.truncateForward(1);
            expect(result).to.deep.eq({ deleted: 2, latestCommit: 1 });
            expect(await wal.latestCommit()).to.eq(1);
            expect([...keyval.get('commits').keys()]).to.deep.eq([1]);
            expect(keyval.get('slots').get('slot_t').lastSeenCommit).to.eq(1);
        });

        it('resumes from last seen commit using persistent slot id', async () => {
            const keyval = new Map();
            const wal = new WalEngine({ keyval, drainMode: 'never' });

            const seenA = [];
            const offA = await wal.subscribe('*', (commit) => seenA.push(commit), { id: 'slot_a' });
            await wal.dispatch({ commitTime: 1, entries: [makeEntry('public', 'users', 'insert', 1)] });
            await offA();

            await wal.dispatch({ commitTime: 2, entries: [makeEntry('public', 'users', 'insert', 2)] });
            await wal.dispatch({ commitTime: 3, entries: [makeEntry('public', 'users', 'insert', 3)] });

            const seenB = [];
            const offB = await wal.subscribe('*', (commit) => seenB.push(commit), { id: 'slot_a' });
            await offB();

            expect(seenA).to.have.length(1);
            expect(seenB.map((c) => c.commitTime)).to.deep.eq([2, 3]);
        });

        it('flushes queued commits that arrive while subscriber is catching up', async () => {
            const keyval = new Map();
            const wal = new WalEngine({ keyval, drainMode: 'never' });

            const off1 = await wal.subscribe('*', async () => undefined, { id: 'slot_q' });
            await wal.dispatch({ commitTime: 1, entries: [makeEntry('public', 'users', 'insert', 1)] });
            await off1();

            await wal.dispatch({ commitTime: 2, entries: [makeEntry('public', 'users', 'insert', 2)] });

            const seen = [];
            const subscribePromise = wal.subscribe('*', async (commit) => {
                seen.push(commit.commitTime);
                if (commit.commitTime === 2) {
                    await new Promise((r) => setTimeout(r, 20));
                }
            }, { id: 'slot_q' });

            setTimeout(() => {
                wal.dispatch({ commitTime: 3, entries: [makeEntry('public', 'users', 'insert', 3)] });
            }, 1);

            const off2 = await subscribePromise;
            await new Promise((r) => setTimeout(r, 40));
            await off2();

            expect(seen).to.include(2);
            expect(seen).to.include(3);
        });
    });
});
