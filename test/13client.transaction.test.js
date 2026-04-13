import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { MainstreamClient } from '../src/clients/abstracts/MainstreamClient.js';
import { ConflictError } from '../src/flashql/errors/ConflictError.js';
import { BaseEdgeClient } from '../src/clients/edge/BaseEdgeClient.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { MainstreamWal } from '../src/clients/abstracts/MainstreamWal.js';

class MockMainstreamClient extends MainstreamClient {
    constructor() {
        super({ dialect: 'postgres' });
        this.calls = [];
        this.wal = new MainstreamWal({ mainstreamClient: this });
    }

    async _begin() {
        this.calls.push('begin');
        const conn = { id: 1 };
        return {
            conn,
            commit: async () => {
                this.calls.push(['commit', conn.id]);
            },
            rollback: async () => {
                this.calls.push(['rollback', conn.id]);
            }
        };
    }

    async _query(query, { tx = null } = {}) {
        return { rows: [{ query: query + '', hasTx: !!tx }] };
    }

    async _stream() {
        return {
            async *[Symbol.asyncIterator]() {
                yield* [];
            }
        };
    }
}

class MockEdgeClient extends BaseEdgeClient {
    constructor() {
        super({ dialect: 'postgres', workerEventNamespace: 'lnkd_' });
        this.calls = [];
    }

    async _exec(op, args) {
        this.calls.push([op, args]);
        if (op === 'transaction:begin') return { id: 'tx_1' };
        if (op === 'transaction:commit') return true;
        if (op === 'transaction:rollback') return true;
        if (op === 'query') return { rows: [{ ok: true, tx: args.options.tx }] };
        if (op === 'stream') {
            return {
                async *[Symbol.asyncIterator]() {
                    yield { tx: args.options.tx, row: 1 };
                }
            };
        }
        return null;
    }
}

class MockEdgeLiveClient extends BaseEdgeClient {
    constructor({ forgetResponse = true } = {}) {
        super({ dialect: 'postgres', workerEventNamespace: 'lnkd_' });
        this.forgetResponse = forgetResponse;
    }

    async _exec(op, args) {
        if (op !== 'query') return null;
        if (!args.options?.live) return { rows: [] };

        const port = new EventTarget();
        port.postRequest = (data, cb, options = {}) => {
            cb({ data: this.forgetResponse, options, payload: data });
        };
        port.readyStateChange = async () => undefined;
        port.close = async () => undefined;

        return {
            data: { rows: [], hashes: [], mode: 'streaming' },
            port,
        };
    }
}

class MockEdgeWalClient extends BaseEdgeClient {
    constructor() {
        super({ dialect: 'postgres', workerEventNamespace: 'lnkd_' });
        this.calls = [];
    }

    async _exec(op, args) {
        this.calls.push([op, args]);
        if (op === 'wal:subscribe') {
            const port = new EventTarget();
            port.readyStateChange = async () => undefined;
            port.close = async () => undefined;
            return { data: true, port };
        }
        if (op === 'wal:forget') return true;
        return null;
    }
}

describe('Client.transaction(cb)', () => {
    it('MainstreamClient: commits successful callback', async () => {
        const client = new MockMainstreamClient();
        const result = await client.transaction(async (tx) => {
            expect(tx.conn.id).to.eq(1);
            return 42;
        });

        expect(result).to.eq(42);
        expect(client.calls).to.deep.eq(['begin', ['commit', 1]]);
    });

    it('MainstreamClient: rolls back failing callback', async () => {
        const client = new MockMainstreamClient();

        await expect(client.transaction(async () => {
            throw new Error('boom');
        })).to.be.rejectedWith('boom');

        expect(client.calls).to.deep.eq(['begin', ['rollback', 1]]);
    });

    it('MainstreamClient: supports client.query(..., { tx }) inside transaction callback', async () => {
        const client = new MockMainstreamClient();

        const rows = await client.transaction(async (tx) => {
            const result = await client.query('SELECT 1', { tx });
            return result.rows;
        });

        expect(rows).to.deep.eq([{ query: 'SELECT 1', hasTx: true }]);
        expect(client.calls).to.deep.eq(['begin', ['commit', 1]]);
    });

    it('MainstreamClient: surfaces begin failure and does not execute callback', async () => {
        class BeginFailClient extends MockMainstreamClient {
            async _begin() {
                this.calls.push('begin');
                throw new Error('begin failed');
            }
        }
        const client = new BeginFailClient();
        let callbackCalled = false;

        await expect(client.transaction(async () => {
            callbackCalled = true;
        })).to.be.rejectedWith('begin failed');

        expect(callbackCalled).to.eq(false);
        expect(client.calls).to.deep.eq(['begin']);
    });

    it('MainstreamLinkedQlWal: applies downstream commits inside a transaction', async () => {
        class WalMockClient extends MockMainstreamClient {
            async _query(query, { tx = null } = {}) {
                this.calls.push(['query', query + '', !!tx]);
                return { rowCount: 1, rows: [] };
            }
        }

        const client = new WalMockClient();
        await client.wal.applyDownstreamCommit({
            entries: [
                {
                    op: 'insert',
                    relation: { namespace: 'public', name: 'users', keyColumns: ['id'] },
                    new: { id: 1, name: 'Ada' },
                },
                {
                    op: 'update',
                    relation: { namespace: 'public', name: 'users', keyColumns: ['id'], mvccKey: 'xmin' },
                    old: { id: 1 },
                    new: { name: 'Ada Lovelace' },
                    mvccTag: 7,
                }
            ],
        });

        expect(client.calls[0]).to.eq('begin');
        expect(client.calls[1][0]).to.eq('query');
        expect(client.calls[1][2]).to.eq(true);
        expect(client.calls[1][1]).to.contain('INSERT INTO "public"."users"');
        expect(client.calls[2][0]).to.eq('query');
        expect(client.calls[2][2]).to.eq(true);
        expect(client.calls[2][1]).to.contain('UPDATE "public"."users"');
        expect(client.calls[2][1]).to.contain('CAST(xmin AS TEXT) = 7');
        expect(client.calls[3]).to.deep.eq(['commit', 1]);
    });

    it('MainstreamLinkedQlWal: raises ConflictError when update/delete affects no rows', async () => {
        class ConflictWalClient extends MockMainstreamClient {
            async _query(query, { tx = null } = {}) {
                this.calls.push(['query', query + '', !!tx]);
                return { rowCount: 0, rows: [] };
            }
        }

        const client = new ConflictWalClient();

        await expect(client.wal.applyDownstreamCommit({
            entries: [
                {
                    op: 'update',
                    relation: { namespace: 'public', name: 'users', keyColumns: ['id'], mvccKey: 'xmin' },
                    old: { id: 1 },
                    new: { name: 'Ada Lovelace' },
                    mvccTag: 7,
                }
            ],
        })).to.be.rejectedWith(ConflictError);

        expect(client.calls[0]).to.eq('begin');
        expect(client.calls[1][0]).to.eq('query');
        expect(client.calls[2]).to.deep.eq(['rollback', 1]);
    });

    it('MainstreamClient: commit failure triggers rollback and surfaces commit error', async () => {
        class CommitFailClient extends MockMainstreamClient {
            async _begin() {
                const tx = await super._begin();
                const _commit = tx.commit;
                tx.commit = async () => {
                    await _commit();
                    throw new Error('commit failed');
                };
                return tx;
            }
        }
        const client = new CommitFailClient();

        await expect(client.transaction(async () => 'ok')).to.be.rejectedWith('commit failed');
        expect(client.calls).to.deep.eq(['begin', ['commit', 1], ['rollback', 1]]);
    });

    it('MainstreamClient: rollback failure surfaces rollback error', async () => {
        class RollbackFailClient extends MockMainstreamClient {
            async _begin() {
                const tx = await super._begin();
                const _rollback = tx.rollback;
                tx.rollback = async () => {
                    await _rollback();
                    throw new Error('rollback failed');
                };
                return tx;
            }
        }
        const client = new RollbackFailClient();

        await expect(client.transaction(async () => {
            throw new Error('boom');
        })).to.be.rejectedWith('rollback failed');

        expect(client.calls).to.deep.eq(['begin', ['rollback', 1]]);
    });

    it('FlashQL: commits successful callback', async () => {
        const client = new FlashQL();
        await client.connect();

        try {
            await client.query('CREATE TABLE public.tx_tbl (id INT PRIMARY KEY, name TEXT)');

            await client.transaction(async (tx) => {
                const table = tx.getRelation({ namespace: 'public', name: 'tx_tbl' });
                await table.insert({ id: 1, name: 'A' });
            });

            const out = await client.query('SELECT id, name FROM public.tx_tbl');
            expect(out.rows).to.deep.eq([{ id: 1, name: 'A' }]);
        } finally {
            await client.disconnect();
        }
    });

    it('FlashQL: rolls back failing callback', async () => {
        const client = new FlashQL();
        await client.connect();

        try {
            await client.query('CREATE TABLE public.tx_tbl_rollback (id INT PRIMARY KEY, name TEXT)');

            await expect(client.transaction(async (tx) => {
                const table = tx.getRelation({ namespace: 'public', name: 'tx_tbl_rollback' });
                await table.insert({ id: 1, name: 'A' });
                throw new Error('rollback please');
            })).to.be.rejectedWith('rollback please');

            const out = await client.query('SELECT id, name FROM public.tx_tbl_rollback');
            expect(out.rows).to.deep.eq([]);
        } finally {
            await client.disconnect();
        }
    });

    it('Edge/BaseEdgeClient: routes begin/query/commit with tx id', async () => {
        const client = new MockEdgeClient();

        const result = await client.transaction(async (tx) => {
            const queryResult = await client.query('SELECT 1', { tx });
            expect(queryResult.rows[0].tx).to.deep.eq({id:'tx_1'});
            return 'ok';
        });

        expect(result).to.eq('ok');
        expect(client.calls.map((c) => c[0])).to.deep.eq(['transaction:begin', 'query', 'transaction:commit']);
    });

    it('Edge/BaseEdgeClient: routes rollback on callback error', async () => {
        const client = new MockEdgeClient();

        await expect(client.transaction(async (tx) => {
            await client.query('SELECT 1', { tx });
            throw new Error('fail tx');
        })).to.be.rejectedWith('fail tx');

        expect(client.calls.map((c) => c[0])).to.deep.eq(['transaction:begin', 'query', 'transaction:rollback']);
    });

    it('Edge/BaseEdgeClient: surfaces begin failure and skips callback', async () => {
        class BeginFailEdgeClient extends MockEdgeClient {
            async _exec(op, args) {
                this.calls.push([op, args]);
                if (op === 'transaction:begin') throw new Error('begin failed');
                return super._exec(op, args);
            }
        }

        const client = new BeginFailEdgeClient();
        let callbackCalled = false;
        await expect(client.transaction(async () => {
            callbackCalled = true;
        })).to.be.rejectedWith('begin failed');
        expect(callbackCalled).to.eq(false);
        expect(client.calls.map((c) => c[0])).to.deep.eq(['transaction:begin']);
    });

    it('Edge/BaseEdgeClient: commit failure attempts rollback and surfaces commit error', async () => {
        class CommitFailEdgeClient extends MockEdgeClient {
            async _exec(op, args) {
                this.calls.push([op, args]);
                if (op === 'transaction:begin') return { id: 'tx_1' };
                if (op === 'transaction:commit') throw new Error('commit failed');
                if (op === 'transaction:rollback') return true;
                if (op === 'query') return { rows: [{ tx: args.options.tx }] };
                return null;
            }
        }

        const client = new CommitFailEdgeClient();
        await expect(client.transaction(async (tx) => {
            await client.query('SELECT 1', { tx });
        })).to.be.rejectedWith('commit failed');

        expect(client.calls.map((c) => c[0])).to.deep.eq(['transaction:begin', 'query', 'transaction:commit', 'transaction:rollback']);
    });

    it('Edge/BaseEdgeClient: stream receives normalized tx id from tx object', async () => {
        const client = new MockEdgeClient();
        const rows = await client.transaction(async (tx) => {
            const iterable = await client.stream('SELECT 1', { tx });
            const out = [];
            for await (const row of iterable) out.push(row);
            return out;
        });

        expect(rows).to.deep.eq([{ tx: { id: 'tx_1' }, row: 1 }]);
        expect(client.calls.map((c) => c[0])).to.deep.eq(['transaction:begin', 'stream', 'transaction:commit']);
    });

    it('Edge/BaseEdgeClient: live abort({ forget: true }) requires boolean forget response', async () => {
        const client = new MockEdgeLiveClient({ forgetResponse: true });
        const result = await client.query('SELECT 1', { live: true, id: 'slot_live_forget' });
        await expect(result.abort({ forget: true })).to.not.be.rejected;
    });

    it('Edge/BaseEdgeClient: live abort({ forget: true }) throws on non-boolean forget response', async () => {
        const client = new MockEdgeLiveClient({ forgetResponse: 'ok' });
        const result = await client.query('SELECT 1', { live: true, id: 'slot_live_forget_bad' });
        await expect(result.abort({ forget: true })).to.be.rejectedWith('Could not execute forget() on remote stream');
    });

    it('EdgeWal: preferRemote=true subscribes through remote edge transport', async () => {
        const client = new MockEdgeWalClient();

        const gc = await client.wal.subscribe({ public: ['users'] }, async () => undefined, {
            id: 'slot_remote',
            preferRemote: true,
        });

        expect(client.calls).to.have.length(1);
        expect(client.calls[0][0]).to.eq('wal:subscribe');
        expect(client.calls[0][1].selector).to.deep.eq({ public: ['users'] });
        expect(client.calls[0][1].options).to.deep.include({ id: 'slot_remote', preferRemote: true });

        await gc();
    });

    it('EdgeWal: preferRemote=false subscribes through local broker and still receives commits', async () => {
        const client = new MockEdgeWalClient();
        const commits = [];

        const gc = await client.wal.subscribe({ public: ['users'] }, async (commit) => {
            commits.push(commit);
        }, {
            id: 'slot_local',
            preferRemote: false,
        });

        const walSubscribeCalls = client.calls.filter(([op]) => op === 'wal:subscribe');
        expect(walSubscribeCalls).to.have.length(1);
        expect(walSubscribeCalls[0][1].selector).to.eq(undefined);
        expect(walSubscribeCalls[0][1].options).to.deep.eq({});

        await client.wal.dispatch({
            txId: 1,
            commitTime: 1,
            entries: [
                {
                    op: 'insert',
                    relation: { namespace: 'public', name: 'users', keyColumns: ['id'] },
                    new: { id: 1, name: 'Ada' },
                }
            ],
        });

        expect(commits).to.have.length(1);
        expect(commits[0].entries[0].new).to.deep.eq({ id: 1, name: 'Ada' });

        await gc();
    });
});
