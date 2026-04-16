import { expect } from 'chai';
import { MessagePortPlus } from '@webqit/port-plus';
import { InMemoryKV } from '@webqit/keyval/inmemory';

import '../src/lang/index.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { EdgeClient } from '../src/clients/edge/EdgeClient.js';
import { EdgeWorker } from '../src/clients/edge/remote/EdgeWorker.js';
import { PGClient } from '../src/clients/postgres/PGClient.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { timeoutMs = 2500, stepMs = 20 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await predicate()) return;
        await sleep(stepMs);
    }
    throw new Error('Timed out waiting for condition');
}

const randName = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const parseEnvJson = (name) => {
    const raw = process.env[name];
    if (!raw) return null;
    return JSON.parse(raw);
};

const canUseDefaultPGConnection = async () => {
    if (process.env.LINKEDQL_TEST_PG_AUTODETECT === '0') return false;

    const client = new PGClient();
    try {
        await Promise.race([
            client.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
        return true;
    } catch {
        return false;
    } finally {
        await client.disconnect().catch(() => { });
    }
};

const resolvePGConfig = async () => {
    const envConfig = parseEnvJson('LINKEDQL_TEST_PG_JSON');
    if (envConfig) return envConfig;
    if (await canUseDefaultPGConnection()) return {};
    return null;
};

const shouldRunPGRealtime = () => process.env.LINKEDQL_TEST_PG_REALTIME === '1';

const createWorkerEdgeClient = (db) => {
    const { port1, port2 } = new MessageChannel();
    MessagePortPlus.upgradeInPlace(port1);
    MessagePortPlus.upgradeInPlace(port2);
    EdgeWorker.webWorker({ db }).runIn(port1);
    return new EdgeClient({ worker: port2, type: 'worker' });
};

class SwitchableEdgeUpstream {
    #client = null;
    #online = true;

    get resolver() {
        return this.#getClient().resolver;
    }

    get parser() {
        return this.#getClient().parser;
    }

    get wal() {
        return {
            subscribe: async (...args) => await this.#getClient().wal.subscribe(...args),
            forget: async (...args) => await this.#getClient().wal.forget(...args),
            applyDownstreamCommit: async (...args) => await this.#getClient().wal.applyDownstreamCommit(...args),
        };
    }

    get live() {
        return {
            forget: async (...args) => await this.#getClient().live.forget(...args),
        };
    }

    async attach(dbOrClient) {
        await this.disconnect();
        this.#client = dbOrClient instanceof EdgeClient ? dbOrClient : createWorkerEdgeClient(dbOrClient);
    }

    setOnline(status) {
        this.#online = !!status;
    }

    async query(...args) {
        return await this.#getClient().query(...args);
    }

    async stream(...args) {
        return await this.#getClient().stream(...args);
    }

    async disconnect() {
        await this.#client?.disconnect?.().catch(() => { });
        this.#client = null;
    }

    #getClient() {
        if (!this.#online || !this.#client) {
            throw new Error('Upstream unavailable');
        }
        return this.#client;
    }
}

const getViewRows = async (db, selector, { hiddenCols = false } = {}) => {
    return await db.storageEngine.transaction(async (tx) => {
        return tx.getRelation(selector, { assertIsView: true }).getAll({ hiddenCols }).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    });
};

const getOutsyncRows = async (db, selector) => {
    return await db.storageEngine.transaction(async (tx) => {
        const view = tx.showView(selector);
        return tx.getRelation({ namespace: 'sys', name: 'sys_outsync_queue' })
            .getAll({ hiddenCols: true })
            .filter((row) => row.relation_id === view.id)
            .sort((a, b) => a.id - b.id);
    });
};

describe('Real-world sync integration stacks', () => {
    describe('EdgeClient -> FlashQL -> Edge -> FlashQL', () => {
        let upstreamDb;
        let localDb;
        let uiDb;
        let upstreamBridge;
        let schemaName;
        let keyvalRegistry;
        let keyval;

        const createPeer = async (suffix = 'kv2') => {
            const bridge = new SwitchableEdgeUpstream();
            await bridge.attach(upstreamDb);

            const db = new FlashQL({
                autoSync: true,
                keyval: new InMemoryKV({ path: [schemaName, suffix], registry: keyvalRegistry }),
                getUpstreamClient: async () => bridge,
            });
            await db.connect();
            await db.query(`CREATE SCHEMA ${schemaName}`);
            await db.storageEngine.transaction(async (tx) => {
                await tx.createView({
                    namespace: schemaName,
                    name: 'users',
                    source_expr: `TABLE ${schemaName}.users`,
                    replication_mode: 'realtime',
                    replication_origin: 'flashql:primary',
                    replication_opts: { write_policy: 'local_first' },
                });
            });

            return {
                bridge,
                db,
                ui: createWorkerEdgeClient(db),
            };
        };

        beforeEach(async () => {
            schemaName = randName('lq_stack_flash');
            keyvalRegistry = new Map();
            keyval = new InMemoryKV({ path: [schemaName, 'kv'], registry: keyvalRegistry });

            upstreamDb = new FlashQL({ autoSync: false });
            await upstreamDb.connect();
            await upstreamDb.query(`
                CREATE SCHEMA ${schemaName};
                CREATE TABLE ${schemaName}.users (id INT PRIMARY KEY, name TEXT);
                INSERT INTO ${schemaName}.users (id, name) VALUES (1, 'Ada');
            `);

            upstreamBridge = new SwitchableEdgeUpstream();
            await upstreamBridge.attach(upstreamDb);

            localDb = new FlashQL({
                autoSync: true,
                keyval,
                getUpstreamClient: async () => upstreamBridge,
            });
            await localDb.connect();
            await localDb.query(`CREATE SCHEMA ${schemaName}`);
            await localDb.storageEngine.transaction(async (tx) => {
                await tx.createView({
                    namespace: schemaName,
                    name: 'users',
                    source_expr: `TABLE ${schemaName}.users`,
                    replication_mode: 'realtime',
                    replication_origin: 'flashql:primary',
                    replication_opts: { write_policy: 'local_first' },
                });
            });

            uiDb = createWorkerEdgeClient(localDb);
        });

        afterEach(async () => {
            await uiDb?.disconnect?.();
            await localDb?.disconnect?.();
            await upstreamBridge?.disconnect?.();
            await upstreamDb?.disconnect?.();
        });

        it('comes up synced automatically on view creation and keeps realtime inbound running without manual sync', async function () {
            this.timeout(10000);

            let result = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(result.rows).to.deep.eq([{ id: 1, name: 'Ada' }]);

            await upstreamDb.query(`UPDATE ${schemaName}.users SET name = 'Ada Lovelace' WHERE id = 1`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows[0]?.name === 'Ada Lovelace';
            });

            await upstreamDb.query(`INSERT INTO ${schemaName}.users (id, name) VALUES (2, 'Linus')`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows.map((row) => row.id).join(',') === '1,2';
            });

            result = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(result.rows).to.deep.eq([
                { id: 1, name: 'Ada Lovelace' },
                { id: 2, name: 'Linus' },
            ]);
        });

        it('drains local_first writes automatically while online without a manual sync call', async function () {
            this.timeout(10000);

            await uiDb.query(`INSERT INTO ${schemaName}.users (id, name) VALUES (2, 'Grace')`);

            await waitFor(async () => {
                const upstream = await upstreamDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                return upstream.rows.some((row) => row.id === 2 && row.name === 'Grace');
            });

            await waitFor(async () => {
                const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                return rows.some((row) => row.id === 2 && row.name === 'Grace' && row.__staged === false);
            });

            const outsyncRows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(outsyncRows).to.have.lengthOf(1);
            expect(outsyncRows[0].status).to.eq('applied');
        });

        it('propagates inbound realtime changes and converges local_first writes after connectivity loss', async function () {
            this.timeout(10000);

            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });
            let result = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(result.rows).to.deep.eq([{ id: 1, name: 'Ada' }]);

            await upstreamDb.query(`UPDATE ${schemaName}.users SET name = 'Ada Lovelace' WHERE id = 1`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows[0]?.name === 'Ada Lovelace';
            });

            await upstreamDb.query(`INSERT INTO ${schemaName}.users (id, name) VALUES (2, 'Linus')`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows.map((row) => row.id).join(',') === '1,2';
            });

            await upstreamDb.query(`DELETE FROM ${schemaName}.users WHERE id = 1`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows.map((row) => row.id).join(',') === '2';
            });

            upstreamBridge.setOnline(false);

            await uiDb.query(`INSERT INTO ${schemaName}.users (id, name) VALUES (3, 'Grace')`);

            const stagedRows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
            const stagedGrace = stagedRows.find((row) => row.id === 3);
            expect(stagedGrace).to.include({ id: 3, name: 'Grace', __staged: true });

            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            const failedQueue = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(failedQueue).to.have.lengthOf(1);
            expect(failedQueue[0].status).to.eq('failed');

            upstreamBridge.setOnline(true);
            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            await waitFor(async () => {
                const upstream = await upstreamDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                return upstream.rows.some((row) => row.id === 3 && row.name === 'Grace');
            });

            await waitFor(async () => {
                const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                return rows.some((row) => row.id === 3 && row.name === 'Grace' && row.__staged === false);
            });

            const appliedQueue = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(appliedQueue).to.have.lengthOf(1);
            expect(appliedQueue[0].status).to.eq('applied');

            result = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(result.rows).to.deep.eq([
                { id: 2, name: 'Linus' },
                { id: 3, name: 'Grace' },
            ]);
        });

        it('replays staged rows and pending outsync after local restart, then converges on reconnect', async function () {
            this.timeout(10000);

            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            upstreamBridge.setOnline(false);
            await uiDb.query(`INSERT INTO ${schemaName}.users (id, name) VALUES (3, 'Grace')`);
            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            let stagedRows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
            expect(stagedRows.find((row) => row.id === 3)).to.include({ id: 3, name: 'Grace', __staged: true });

            let outsyncRows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(outsyncRows).to.have.lengthOf(1);
            expect(outsyncRows[0].status).to.eq('failed');

            await uiDb.disconnect();
            await localDb.disconnect();

            localDb = new FlashQL({
                autoSync: false,
                keyval: new InMemoryKV({ path: [schemaName, 'kv'], registry: keyvalRegistry }),
                getUpstreamClient: async () => upstreamBridge,
            });
            await localDb.connect();
            uiDb = createWorkerEdgeClient(localDb);

            stagedRows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
            expect(stagedRows.find((row) => row.id === 3)).to.include({ id: 3, name: 'Grace', __staged: true });

            outsyncRows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(outsyncRows).to.have.lengthOf(1);
            expect(outsyncRows[0].status).to.eq('failed');

            upstreamBridge.setOnline(true);
            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            await waitFor(async () => {
                const upstream = await upstreamDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                return upstream.rows.some((row) => row.id === 3 && row.name === 'Grace');
            });

            await waitFor(async () => {
                const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                return rows.some((row) => row.id === 3 && row.name === 'Grace' && row.__staged === false);
            });

            outsyncRows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(outsyncRows).to.have.lengthOf(1);
            expect(outsyncRows[0].status).to.eq('applied');
        });

        it('handles competing offline local_first updates across two clients predictably', async function () {
            this.timeout(15000);

            const { bridge: bridge2, db: localDb2, ui: uiDb2 } = await createPeer('kv2');

            try {
                await waitFor(async () => {
                    const rows1 = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    const rows2 = (await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    return rows1[0]?.name === 'Ada' && rows2[0]?.name === 'Ada';
                });

                upstreamBridge.setOnline(false);
                bridge2.setOnline(false);

                await uiDb.query(`UPDATE ${schemaName}.users SET name = 'Ada Client 1' WHERE id = 1`);
                await uiDb2.query(`UPDATE ${schemaName}.users SET name = 'Ada Client 2' WHERE id = 1`);

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });

                const stagedRows1 = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                const stagedRows2 = await getViewRows(localDb2, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                expect(stagedRows1.find((row) => row.id === 1)).to.include({ name: 'Ada Client 1', __staged: true });
                expect(stagedRows2.find((row) => row.id === 1)).to.include({ name: 'Ada Client 2', __staged: true });

                upstreamBridge.setOnline(true);
                await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const upstream = await upstreamDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                    return upstream.rows[0]?.name === 'Ada Client 1';
                });
                await waitFor(async () => {
                    const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                    return rows.find((row) => row.id === 1)?.__staged === false;
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'applied';
                });

                bridge2.setOnline(true);
                await uiDb2.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'conflicted';
                });
                await waitFor(async () => {
                    const rows = await getViewRows(localDb2, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                    const row = rows.find((candidate) => candidate.id === 1);
                    return row?.name === 'Ada Client 1' && row?.__staged === false;
                });

                const finalRows1 = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                const finalRows2 = await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                expect(finalRows1.rows).to.deep.eq([{ id: 1, name: 'Ada Client 1' }]);
                expect(finalRows2.rows).to.deep.eq([{ id: 1, name: 'Ada Client 1' }]);
            } finally {
                await uiDb2.disconnect();
                await localDb2.disconnect();
                await bridge2.disconnect();
            }
        });

        it('handles offline delete losing to a competing offline update predictably', async function () {
            this.timeout(15000);

            const { bridge: bridge2, db: localDb2, ui: uiDb2 } = await createPeer('kv3');

            try {
                await waitFor(async () => {
                    const rows1 = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    const rows2 = (await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    return rows1[0]?.name === 'Ada' && rows2[0]?.name === 'Ada';
                });

                upstreamBridge.setOnline(false);
                bridge2.setOnline(false);

                await uiDb.query(`DELETE FROM ${schemaName}.users WHERE id = 1`);
                await uiDb2.query(`UPDATE ${schemaName}.users SET name = 'Ada Updated' WHERE id = 1`);

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });

                bridge2.setOnline(true);
                await uiDb2.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const upstream = await upstreamDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                    return upstream.rows.length === 1 && upstream.rows[0]?.name === 'Ada Updated';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'applied';
                });

                upstreamBridge.setOnline(true);
                await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'conflicted';
                });
                await waitFor(async () => {
                    const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                    const row = rows.find((candidate) => candidate.id === 1);
                    return row?.name === 'Ada Updated' && row?.__staged === false;
                });

                const finalRows1 = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                const finalRows2 = await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                expect(finalRows1.rows).to.deep.eq([{ id: 1, name: 'Ada Updated' }]);
                expect(finalRows2.rows).to.deep.eq([{ id: 1, name: 'Ada Updated' }]);
            } finally {
                await uiDb2.disconnect();
                await localDb2.disconnect();
                await bridge2.disconnect();
            }
        });

        it('handles offline update losing to a competing offline delete predictably', async function () {
            this.timeout(15000);

            const { bridge: bridge2, db: localDb2, ui: uiDb2 } = await createPeer('kv4');

            try {
                await waitFor(async () => {
                    const rows1 = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    const rows2 = (await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    return rows1[0]?.name === 'Ada' && rows2[0]?.name === 'Ada';
                });

                upstreamBridge.setOnline(false);
                bridge2.setOnline(false);

                await uiDb.query(`UPDATE ${schemaName}.users SET name = 'Ada Updated' WHERE id = 1`);
                await uiDb2.query(`DELETE FROM ${schemaName}.users WHERE id = 1`);

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });

                bridge2.setOnline(true);
                await uiDb2.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const upstream = await upstreamDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                    return upstream.rows.length === 0;
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'applied';
                });

                upstreamBridge.setOnline(true);
                await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'conflicted';
                });
                await waitFor(async () => {
                    const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                    return !rows.some((candidate) => candidate.id === 1);
                });

                const finalRows1 = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                const finalRows2 = await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
                expect(finalRows1.rows).to.deep.eq([]);
                expect(finalRows2.rows).to.deep.eq([]);
            } finally {
                await uiDb2.disconnect();
                await localDb2.disconnect();
                await bridge2.disconnect();
            }
        });
    });

    describe('EdgeClient -> FlashQL -> Edge -> PG', () => {
        let pgConfig;
        let upstreamDb;
        let localDb;
        let uiDb;
        let upstreamBridge;
        let tableName;
        let schemaName;

        const createPeer = async (dbName) => {
            const bridge = new SwitchableEdgeUpstream();
            await bridge.attach(upstreamDb);

            const db = new FlashQL({
                autoSync: true,
                keyval: new InMemoryKV({ path: [schemaName, dbName], registry: new Map() }),
                getUpstreamClient: async () => bridge,
            });
            await db.connect();
            await db.query(`CREATE SCHEMA ${schemaName}`);
            await db.query(`
                CREATE REALTIME VIEW ${schemaName}.users AS
                TABLE public.${tableName}
                WITH (
                    replication_origin = 'postgres:primary',
                    write_policy = 'local_first'
                )
            `);

            return {
                bridge,
                db,
                ui: createWorkerEdgeClient(db),
            };
        };

        before(async function () {
            pgConfig = await resolvePGConfig();
            if (!pgConfig || !shouldRunPGRealtime()) this.skip();
        });

        beforeEach(async function () {
            this.timeout(10000);

            tableName = randName('lq_stack_pg_users');
            schemaName = randName('lq_stack_pg');

            upstreamDb = new PGClient({
                ...pgConfig,
                walSlotName: randName('linkedql_stack_slot'),
                pgPublications: randName('linkedql_stack_pub'),
            });
            await upstreamDb.connect();
            await upstreamDb.query(`
                CREATE TABLE IF NOT EXISTS public.${tableName} (
                    id INT PRIMARY KEY,
                    name TEXT
                )
            `);
            await upstreamDb.query(`DELETE FROM public.${tableName}`);
            await upstreamDb.query(`INSERT INTO public.${tableName} (id, name) VALUES (1, 'Ada')`);

            upstreamBridge = new SwitchableEdgeUpstream();
            await upstreamBridge.attach(upstreamDb);

            localDb = new FlashQL({
                autoSync: true,
                getUpstreamClient: async () => upstreamBridge,
            });
            await localDb.connect();
            await localDb.query(`CREATE SCHEMA ${schemaName}`);
            await localDb.query(`
                CREATE REALTIME VIEW ${schemaName}.users AS
                TABLE public.${tableName}
                WITH (
                    replication_origin = 'postgres:primary',
                    write_policy = 'local_first'
                )
            `);

            uiDb = createWorkerEdgeClient(localDb);
        });

        afterEach(async () => {
            await uiDb?.disconnect?.();
            await localDb?.disconnect?.();
            await upstreamBridge?.disconnect?.();
            await upstreamDb?.query(`DROP TABLE IF EXISTS public.${tableName}`).catch(() => { });
            await upstreamDb?.disconnect?.();
        });

        it('comes up synced automatically on view creation and keeps realtime PG inbound running without manual sync', async function () {
            this.timeout(10000);

            let localRows = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(localRows.rows).to.deep.eq([{ id: 1, name: 'Ada' }]);

            await upstreamDb.query(`UPDATE public.${tableName} SET name = 'Ada Lovelace' WHERE id = 1`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows[0]?.name === 'Ada Lovelace';
            });

            await upstreamDb.query(`INSERT INTO public.${tableName} (id, name) VALUES (2, 'Linus')`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows.map((row) => row.id).join(',') === '1,2';
            });

            localRows = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(localRows.rows).to.deep.eq([
                { id: 1, name: 'Ada Lovelace' },
                { id: 2, name: 'Linus' },
            ]);
        });

        it('drains local_first PG writes automatically while online without a manual sync call', async function () {
            this.timeout(10000);

            await uiDb.query(`INSERT INTO ${schemaName}.users (id, name) VALUES (2, 'Grace')`);

            await waitFor(async () => {
                const upstream = await upstreamDb.query(`SELECT id, name FROM public.${tableName} ORDER BY id`);
                return upstream.rows.some((row) => row.id === 2 && row.name === 'Grace');
            });

            await waitFor(async () => {
                const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                return rows.some((row) => row.id === 2 && row.name === 'Grace' && row.__staged === false);
            });

            const outsyncRows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(outsyncRows).to.have.lengthOf(1);
            expect(outsyncRows[0].status).to.eq('applied');
        });

        it('propagates inbound realtime PG changes and converges local_first writes after connectivity loss', async function () {
            this.timeout(10000);

            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            let localRows = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(localRows.rows).to.deep.eq([{ id: 1, name: 'Ada' }]);

            await upstreamDb.query(`UPDATE public.${tableName} SET name = 'Ada Lovelace' WHERE id = 1`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows[0]?.name === 'Ada Lovelace';
            });

            await upstreamDb.query(`INSERT INTO public.${tableName} (id, name) VALUES (2, 'Linus')`);
            await waitFor(async () => {
                const rows = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                return rows.map((row) => row.id).join(',') === '1,2';
            });

            upstreamBridge.setOnline(false);

            await uiDb.query(`INSERT INTO ${schemaName}.users (id, name) VALUES (3, 'Grace')`);
            localRows = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(localRows.rows).to.deep.eq([
                { id: 1, name: 'Ada Lovelace' },
                { id: 2, name: 'Linus' },
                { id: 3, name: 'Grace' },
            ]);

            const stagedRows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
            expect(stagedRows.find((row) => row.id === 3)).to.include({ id: 3, name: 'Grace', __staged: true });

            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            let outsyncRows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(outsyncRows).to.have.lengthOf(1);
            expect(outsyncRows[0].status).to.eq('failed');

            upstreamBridge.setOnline(true);
            await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

            await waitFor(async () => {
                const upstream = await upstreamDb.query(`SELECT id, name FROM public.${tableName} ORDER BY id`);
                return upstream.rows.some((row) => row.id === 3 && row.name === 'Grace');
            });

            await waitFor(async () => {
                const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                return rows.some((row) => row.id === 3 && row.name === 'Grace' && row.__staged === false);
            });

            outsyncRows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
            expect(outsyncRows).to.have.lengthOf(1);
            expect(outsyncRows[0].status).to.eq('applied');

            localRows = await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`);
            expect(localRows.rows).to.deep.eq([
                { id: 1, name: 'Ada Lovelace' },
                { id: 2, name: 'Linus' },
                { id: 3, name: 'Grace' },
            ]);
        });

        it('handles competing offline local_first PG updates across two clients predictably', async function () {
            this.timeout(15000);

            const { bridge: bridge2, db: localDb2, ui: uiDb2 } = await createPeer('pg_kv2');

            try {
                await waitFor(async () => {
                    const rows1 = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    const rows2 = (await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    return rows1[0]?.name === 'Ada' && rows2[0]?.name === 'Ada';
                });

                upstreamBridge.setOnline(false);
                bridge2.setOnline(false);

                await uiDb.query(`UPDATE ${schemaName}.users SET name = 'Ada Client 1' WHERE id = 1`);
                await uiDb2.query(`UPDATE ${schemaName}.users SET name = 'Ada Client 2' WHERE id = 1`);

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });

                upstreamBridge.setOnline(true);
                await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const upstream = await upstreamDb.query(`SELECT id, name FROM public.${tableName} ORDER BY id`);
                    return upstream.rows[0]?.name === 'Ada Client 1';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'applied';
                });

                bridge2.setOnline(true);
                await uiDb2.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'conflicted';
                });
                await waitFor(async () => {
                    const rows = await getViewRows(localDb2, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                    const row = rows.find((candidate) => candidate.id === 1);
                    return row?.name === 'Ada Client 1' && row?.__staged === false;
                });
            } finally {
                await uiDb2.disconnect();
                await localDb2.disconnect();
                await bridge2.disconnect();
            }
        });

        it('handles offline delete losing to a competing offline PG update predictably', async function () {
            this.timeout(15000);

            const { bridge: bridge2, db: localDb2, ui: uiDb2 } = await createPeer('pg_kv3');

            try {
                await waitFor(async () => {
                    const rows1 = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    const rows2 = (await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    return rows1[0]?.name === 'Ada' && rows2[0]?.name === 'Ada';
                });

                upstreamBridge.setOnline(false);
                bridge2.setOnline(false);

                await uiDb.query(`DELETE FROM ${schemaName}.users WHERE id = 1`);
                await uiDb2.query(`UPDATE ${schemaName}.users SET name = 'Ada Updated' WHERE id = 1`);

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });

                bridge2.setOnline(true);
                await uiDb2.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const upstream = await upstreamDb.query(`SELECT id, name FROM public.${tableName} ORDER BY id`);
                    return upstream.rows.length === 1 && upstream.rows[0]?.name === 'Ada Updated';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'applied';
                });

                upstreamBridge.setOnline(true);
                await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'conflicted';
                });
                await waitFor(async () => {
                    const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                    const row = rows.find((candidate) => candidate.id === 1);
                    return row?.name === 'Ada Updated' && row?.__staged === false;
                });
            } finally {
                await uiDb2.disconnect();
                await localDb2.disconnect();
                await bridge2.disconnect();
            }
        });

        it('handles offline update losing to a competing offline PG delete predictably', async function () {
            this.timeout(15000);

            const { bridge: bridge2, db: localDb2, ui: uiDb2 } = await createPeer('pg_kv4');

            try {
                await waitFor(async () => {
                    const rows1 = (await uiDb.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    const rows2 = (await uiDb2.query(`SELECT id, name FROM ${schemaName}.users ORDER BY id`)).rows;
                    return rows1[0]?.name === 'Ada' && rows2[0]?.name === 'Ada';
                });

                upstreamBridge.setOnline(false);
                bridge2.setOnline(false);

                await uiDb.query(`UPDATE ${schemaName}.users SET name = 'Ada Updated' WHERE id = 1`);
                await uiDb2.query(`DELETE FROM ${schemaName}.users WHERE id = 1`);

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'failed';
                });

                bridge2.setOnline(true);
                await uiDb2.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const upstream = await upstreamDb.query(`SELECT id, name FROM public.${tableName} ORDER BY id`);
                    return upstream.rows.length === 0;
                });
                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb2, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'applied';
                });

                upstreamBridge.setOnline(true);
                await uiDb.sync.sync({ [schemaName]: 'users' }, { forceSync: true });

                await waitFor(async () => {
                    const rows = await getOutsyncRows(localDb, { namespace: schemaName, name: 'users' });
                    return rows.length === 1 && rows[0].status === 'conflicted';
                });
                await waitFor(async () => {
                    const rows = await getViewRows(localDb, { namespace: schemaName, name: 'users' }, { hiddenCols: true });
                    return !rows.some((candidate) => candidate.id === 1);
                });
            } finally {
                await uiDb2.disconnect();
                await localDb2.disconnect();
                await bridge2.disconnect();
            }
        });
    });
});
