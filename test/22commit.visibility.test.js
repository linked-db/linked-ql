import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { LinkedQlWal } from '../src/proc/timeline/LinkedQlWal.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { SYSTEM_TAG } from '../src/proc/SYSTEM.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, { timeoutMs = 1000, stepMs = 10 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await predicate()) return;
        await sleep(stepMs);
    }
    throw new Error('Timed out waiting for condition');
}

const makeCommit = (entry) => ({
    txId: 1,
    commitTime: 1,
    entries: [entry],
});

const makeCommitEntries = (...entries) => ({
    txId: 1,
    commitTime: 1,
    entries,
});

const makeInsert = (id = 1, relation = { namespace: 'public', name: 'users', keyColumns: ['id'] }) => ({
    op: 'insert',
    relation,
    new: { id, name: `user_${id}` },
});

describe('Commit visibility and transaction-scoped realtime', () => {
    describe('LinkedQlWal resolveCommitVisibility()', () => {
        it('requires resolveCommitVisibility for transaction-scoped wal subscriptions', async () => {
            const wal = new LinkedQlWal({ drainMode: 'never' });
            const seen = [];

            await wal.subscribe((commit) => seen.push(commit), { tx: { id: 'tx_1' } });

            await expect(wal.dispatch(makeCommit(makeInsert())))
                .to.be.rejectedWith('resolveCommitVisibility');

            expect(seen).to.deep.eq([]);
        });

        it('passes through non-transaction wal subscriptions when no hook exists', async () => {
            const wal = new LinkedQlWal({ drainMode: 'never' });
            const seen = [];

            await wal.subscribe((commit) => seen.push(commit));
            await wal.dispatch(makeCommit(makeInsert()));

            expect(seen).to.have.length(1);
            expect(seen[0].entries[0].new.id).to.eq(1);
        });

        it('calls resolveCommitVisibility for wal subscriptions outside tx and honors filtered arrays and null', async () => {
            const baseCommit = makeCommitEntries(makeInsert(1), makeInsert(2));
            const returns = [
                (entries) => entries,
                (entries) => [entries[1]],
                () => null,
            ];
            const results = [];

            for (const resolver of returns) {
                const calls = [];
                const wal = new LinkedQlWal({
                    drainMode: 'never',
                    linkedQlClient: {
                        options: {
                            resolveCommitVisibility: async (entries, sub) => {
                                calls.push({ entries, sub });
                                return resolver(entries);
                            },
                        },
                    },
                });

                const seen = [];
                await wal.subscribe((commit) => seen.push(commit));
                await wal.dispatch(baseCommit);
                results.push({ seen, calls });
            }

            expect(results[0].calls).to.have.length(1);
            expect(results[0].calls[0].sub).to.deep.eq({ tx: null, liveQueryOriginated: false });
            expect(Object.isFrozen(results[0].calls[0].entries)).to.eq(true);
            expect(results[0].seen).to.have.length(1);
            expect(results[0].seen[0].entries).to.have.length(2);
            expect(results[1].seen).to.have.length(1);
            expect(results[1].seen[0].entries).to.have.length(1);
            expect(results[1].seen[0].entries[0].new.id).to.eq(2);
            expect(results[2].seen).to.have.length(0);
        });

        it('rejects invalid resolveCommitVisibility return values', async () => {
            const wal = new LinkedQlWal({
                drainMode: 'never',
                linkedQlClient: {
                    options: {
                        resolveCommitVisibility: async () => 'yes',
                    },
                },
            });

            await wal.subscribe(() => undefined);
            await expect(wal.dispatch(makeCommit(makeInsert())))
                .to.be.rejectedWith('must return either an array of entries or null');
        });

        it('marks live-query-originated subscriptions with isVisible when hook returns filtered entries', async () => {
            const wal = new LinkedQlWal({
                drainMode: 'never',
                linkedQlClient: {
                    options: {
                        centralizeCommitVisibility: true,
                        resolveCommitVisibility: async (entries) => [entries[0]],
                    },
                },
            });
            const seen = [];

            await wal.subscribe((commit) => seen.push(commit), {
                tx: { id: 'tx_live' },
                liveQueryOriginated: SYSTEM_TAG,
            });
            await wal.dispatch(makeCommitEntries(makeInsert(1), makeInsert(2)));

            expect(seen).to.have.length(1);
            expect(seen[0].isVisible).to.eq(SYSTEM_TAG);
            expect(seen[0].entries).to.have.length(1);
            expect(seen[0].entries[0].new.id).to.eq(1);
        });

        it('lets live-query-originated subscriptions fall back to requery when hook returns null', async () => {
            const wal = new LinkedQlWal({
                drainMode: 'never',
                linkedQlClient: {
                    options: {
                        centralizeCommitVisibility: true,
                        resolveCommitVisibility: async () => null,
                    },
                },
            });
            const seen = [];

            await wal.subscribe((commit) => seen.push(commit), {
                tx: { id: 'tx_live' },
                liveQueryOriginated: SYSTEM_TAG,
            });
            await wal.dispatch(makeCommit(makeInsert()));

            expect(seen).to.have.length(1);
            expect(seen[0].isVisible).to.eq(null);
        });

        it('blocks live-query-originated subscriptions when hook returns an empty array', async () => {
            const wal = new LinkedQlWal({
                drainMode: 'never',
                linkedQlClient: {
                    options: {
                        centralizeCommitVisibility: true,
                        resolveCommitVisibility: async () => [],
                    },
                },
            });
            const seen = [];

            await wal.subscribe((commit) => seen.push(commit), {
                tx: { id: 'tx_live' },
                liveQueryOriginated: SYSTEM_TAG,
            });
            await wal.dispatch(makeCommit(makeInsert()));

            expect(seen).to.have.length(0);
        });

        it('bypasses resolveCommitVisibility for live-query-originated subscriptions', async () => {
            let callCount = 0;
            const wal = new LinkedQlWal({
                drainMode: 'never',
                linkedQlClient: {
                    options: {
                        resolveCommitVisibility: async () => {
                            callCount += 1;
                            return [];
                        },
                    },
                },
            });
            const seen = [];

            await wal.subscribe((commit) => seen.push(commit), {
                tx: { id: 'tx_live' },
                liveQueryOriginated: SYSTEM_TAG,
            });
            await wal.dispatch(makeCommit(makeInsert()));

            expect(callCount).to.eq(0);
            expect(seen).to.have.length(1);
            expect(seen[0].isVisible).to.eq(undefined);
        });
    });

    describe('FlashQL transaction-scoped visibility integration', () => {
        let client;
        let tx;
        let visibilityCalls;

        beforeEach(async () => {
            visibilityCalls = [];
            client = new FlashQL({
                resolveCommitVisibility: async (entries, sub) => {
                    visibilityCalls.push({ entries, sub });

                    const visibleEntries = [];
                    for (const entry of entries) {
                        const id = entry.old?.id ?? entry.new?.id;
                        const result = await client.query(
                            `
                            SELECT i.id
                            FROM public.secure_items i
                            JOIN public.item_acl a ON a.item_id = i.id
                            WHERE i.id = ${id}
                              AND a.viewer = 'user_a'
                            `,
                            { tx: sub.tx }
                        );

                        if (entry.op === 'delete') {
                            if (!result.rows.length) visibleEntries.push(entry);
                            continue;
                        }
                        if (result.rows.length) visibleEntries.push(entry);
                    }
                    return visibleEntries;
                },
            });
            await client.connect();
            await client.query(`
                CREATE TABLE public.secure_items (
                    id INT PRIMARY KEY,
                    name TEXT
                )
            `);
            await client.query(`
                CREATE TABLE public.item_acl (
                    item_id INT PRIMARY KEY,
                    viewer TEXT
                )
            `);
            tx = await client.begin();
        });

        afterEach(async () => {
            await tx?.rollback?.().catch(() => { });
            await client?.disconnect?.();
        });

        it('lets a transaction-scoped wal subscription resolve insert visibility by querying in sub.tx', async () => {
            const commits = [];
            const unsubscribe = await client.wal.subscribe({ public: ['secure_items'] }, (commit) => commits.push(commit), { tx });

            await client.query(`
                INSERT INTO public.secure_items (id, name) VALUES (1, 'Ada');
                INSERT INTO public.item_acl (item_id, viewer) VALUES (1, 'user_a');
            `, { tx });
            await tx.commit();

            await waitFor(() => commits.length === 1);

            expect(commits[0].entries[0].op).to.eq('insert');
            expect(commits[0].entries[0].new).to.deep.eq({ id: 1, name: 'Ada' });
            expect(visibilityCalls).to.have.length(1);
            expect(visibilityCalls[0].sub.tx).to.eq(tx);

            await unsubscribe.abort();
        });

        it('filters mixed-visibility entries within a single wal commit', async () => {
            const commits = [];
            const unsubscribe = await client.wal.subscribe({ public: ['secure_items'] }, (commit) => commits.push(commit), { tx });

            await client.query(`
                INSERT INTO public.secure_items (id, name) VALUES (4, 'Visible'), (5, 'Hidden');
                INSERT INTO public.item_acl (item_id, viewer) VALUES (4, 'user_a');
            `, { tx });
            await tx.commit();

            await waitFor(() => commits.length === 1);

            expect(commits[0].entries).to.have.length(1);
            expect(commits[0].entries[0].new).to.deep.eq({ id: 4, name: 'Visible' });
            expect(visibilityCalls).to.have.length(1);
            expect(visibilityCalls[0].entries).to.have.length(2);

            await unsubscribe.abort();
        });

        it('suppresses transaction-scoped wal commits when the lookup says the row is not visible', async () => {
            const commits = [];
            const unsubscribe = await client.wal.subscribe({ public: ['secure_items'] }, (commit) => commits.push(commit), { tx });

            await client.query(`INSERT INTO public.secure_items (id, name) VALUES (2, 'Hidden')`, { tx });
            await tx.commit();
            await sleep(40);

            expect(commits).to.have.length(0);
            expect(visibilityCalls).to.have.length(1);

            await unsubscribe.abort();
        });

        it('lets a transaction-scoped wal subscription validate deletes by confirming the row is gone in sub.tx', async () => {
            await client.query(`
                INSERT INTO public.secure_items (id, name) VALUES (3, 'ToDelete');
                INSERT INTO public.item_acl (item_id, viewer) VALUES (3, 'user_a');
            `, { tx });

            const commits = [];
            const unsubscribe = await client.wal.subscribe({ public: ['secure_items'] }, (commit) => commits.push(commit), { tx });

            await client.query(`
                DELETE FROM public.item_acl WHERE item_id = 3;
                DELETE FROM public.secure_items WHERE id = 3;
            `, { tx });
            await tx.commit();

            await waitFor(() => commits.length === 1);

            expect(commits[0].entries[0].op).to.eq('delete');
            expect(commits[0].entries[0].old.id).to.eq(3);

            await unsubscribe.abort();
        });

        it('uses tx-scoped visibility for the initial render of transaction-scoped live queries without touching resolveCommitVisibility', async () => {
            await client.query(`
                INSERT INTO public.secure_items (id, name) VALUES (10, 'Ada');
                INSERT INTO public.item_acl (item_id, viewer) VALUES (10, 'user_a');
            `, { tx });

            const result = await client.query(
                `
                SELECT i.id, i.name
                FROM public.secure_items i
                JOIN public.item_acl a ON a.item_id = i.id
                WHERE a.viewer = 'user_a'
                ORDER BY i.id
                `,
                { live: true, tx }
            );

            expect(result.rows).to.deep.eq([{ id: 10, name: 'Ada' }]);
            expect(visibilityCalls).to.have.length(0);

            await result.abort();
        });

        it('lets transaction-scoped live queries use resolveCommitVisibility to skip non-visible commits', async () => {
            await tx.rollback();
            visibilityCalls = [];

            client = new FlashQL({
                centralizeCommitVisibility: true,
                resolveCommitVisibility: async (entries, sub) => {
                    visibilityCalls.push({ entries, sub });
                    return entries.filter((entry) => entry.new?.name !== 'Hidden');
                },
            });
            await client.connect();
            await client.query(`
                CREATE TABLE public.secure_items (
                    id INT PRIMARY KEY,
                    name TEXT
                )
            `);
            tx = await client.begin();

            const result = await client.query(
                `SELECT id, name FROM public.secure_items ORDER BY id`,
                { live: true, tx }
            );

            await client.query(`INSERT INTO public.secure_items (id, name) VALUES (22, 'Hidden')`, { tx });
            await tx.commit();
            await sleep(40);

            expect(result.rows).to.deep.eq([]);
            expect(visibilityCalls.length).to.be.greaterThan(0);
            expect(visibilityCalls.every(({ sub }) => sub.liveQueryOriginated === true)).to.eq(true);

            await result.abort();
        });
    });
});
