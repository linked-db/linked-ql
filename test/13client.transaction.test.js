import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { MainstreamDBClient } from '../src/clients/abstracts/MainstreamDBClient.js';
import { BaseEdgeClient } from '../src/clients/edge/BaseEdgeClient.js';
import { FlashQL } from '../src/flashql/FlashQL.js';

class MockMainstreamClient extends MainstreamDBClient {
    constructor() {
        super({ dialect: 'postgres' });
        this.calls = [];
    }

    async _beginTransaction() {
        this.calls.push('begin');
        return { conn: { id: 1 } };
    }

    async _commitTransaction(tx) {
        this.calls.push(['commit', tx.conn.id]);
    }

    async _rollbackTransaction(tx) {
        this.calls.push(['rollback', tx.conn.id]);
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

describe('Client.transaction(cb)', () => {
    it('MainstreamDBClient: commits successful callback', async () => {
        const client = new MockMainstreamClient();
        const result = await client.transaction(async (tx) => {
            expect(tx.conn.id).to.eq(1);
            return 42;
        });

        expect(result).to.eq(42);
        expect(client.calls).to.deep.eq(['begin', ['commit', 1]]);
    });

    it('MainstreamDBClient: rolls back failing callback', async () => {
        const client = new MockMainstreamClient();

        await expect(client.transaction(async () => {
            throw new Error('boom');
        })).to.be.rejectedWith('boom');

        expect(client.calls).to.deep.eq(['begin', ['rollback', 1]]);
    });

    it('MainstreamDBClient: supports client.query(..., { tx }) inside transaction callback', async () => {
        const client = new MockMainstreamClient();

        const rows = await client.transaction(async (tx) => {
            const result = await client.query('SELECT 1', { tx });
            return result.rows;
        });

        expect(rows).to.deep.eq([{ query: 'SELECT 1', hasTx: true }]);
        expect(client.calls).to.deep.eq(['begin', ['commit', 1]]);
    });

    it('MainstreamDBClient: surfaces begin failure and does not execute callback', async () => {
        class BeginFailClient extends MockMainstreamClient {
            async _beginTransaction() {
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

    it('MainstreamDBClient: commit failure triggers rollback and surfaces commit error', async () => {
        class CommitFailClient extends MockMainstreamClient {
            async _commitTransaction(tx) {
                this.calls.push(['commit', tx.conn.id]);
                throw new Error('commit failed');
            }
        }
        const client = new CommitFailClient();

        await expect(client.transaction(async () => 'ok')).to.be.rejectedWith('commit failed');
        expect(client.calls).to.deep.eq(['begin', ['commit', 1], ['rollback', 1]]);
    });

    it('MainstreamDBClient: rollback failure surfaces rollback error', async () => {
        class RollbackFailClient extends MockMainstreamClient {
            async _rollbackTransaction(tx) {
                this.calls.push(['rollback', tx.conn.id]);
                throw new Error('rollback failed');
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
            expect(queryResult.rows[0].tx).to.eq('tx_1');
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

        expect(rows).to.deep.eq([{ tx: 'tx_1', row: 1 }]);
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
});
