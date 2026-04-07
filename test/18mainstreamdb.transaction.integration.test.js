import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { PGClient } from '../src/clients/postgres/PGClient.js';
import { MySQLClient } from '../src/clients/mysql/MySQLClient.js';
import { MariaDBClient } from '../src/clients/mariadb/MariaDBClient.js';

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
        await client.disconnect().catch(() => {});
    }
};

const resolveTestConfig = async (envName, Client) => {
    const config = parseEnvJson(envName);
    if (config) return config;
    if (Client === PGClient && await canUseDefaultPGConnection()) return {};
    return null;
};

const randTable = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const runTxSuite = ({ title, envName, Client, createSql, insertSql, selectSql, dropSql }) => {
    describe(title, function () {
        this.timeout(10000);

        let client;
        let tableName;
        let config;

        before(async function () {
            config = await resolveTestConfig(envName, Client);
            if (!config) this.skip();

            client = new Client(config);
            await client.connect();
        });

        beforeEach(async function () {
            tableName = randTable('lq_tx_integration');
            await client.query(createSql(tableName));
        });

        afterEach(async function () {
            await client.query(dropSql(tableName));
        });

        after(async function () {
            await client?.disconnect();
        });

        it('commits transaction callback writes', async function () {
            await client.transaction(async (tx) => {
                await client.query(insertSql(tableName, 1, 'A'), { tx });
            });

            const out = await client.query(selectSql(tableName));
            expect(out.rows).to.have.length(1);
        });

        it('rolls back transaction callback writes on throw', async function () {
            await expect(client.transaction(async (tx) => {
                await client.query(insertSql(tableName, 1, 'A'), { tx });
                throw new Error('rollback please');
            })).to.be.rejectedWith('rollback please');

            const out = await client.query(selectSql(tableName));
            expect(out.rows).to.have.length(0);
        });
    });
};

runTxSuite({
    title: 'PGClient transaction integration',
    envName: 'LINKEDQL_TEST_PG_JSON',
    Client: PGClient,
    createSql: (t) => `CREATE TABLE IF NOT EXISTS public.${t} (id INT PRIMARY KEY, name TEXT)`,
    insertSql: (t, id, name) => `INSERT INTO public.${t} (id, name) VALUES (${id}, '${name}')`,
    selectSql: (t) => `SELECT id, name FROM public.${t} ORDER BY id`,
    dropSql: (t) => `DROP TABLE IF EXISTS public.${t}`,
});

runTxSuite({
    title: 'MySQLClient transaction integration',
    envName: 'LINKEDQL_TEST_MYSQL_JSON',
    Client: MySQLClient,
    createSql: (t) => `CREATE TABLE IF NOT EXISTS ${t} (id INT PRIMARY KEY, name VARCHAR(255))`,
    insertSql: (t, id, name) => `INSERT INTO ${t} (id, name) VALUES (${id}, '${name}')`,
    selectSql: (t) => `SELECT id, name FROM ${t} ORDER BY id`,
    dropSql: (t) => `DROP TABLE IF EXISTS ${t}`,
});

runTxSuite({
    title: 'MariaDBClient transaction integration',
    envName: 'LINKEDQL_TEST_MARIADB_JSON',
    Client: MariaDBClient,
    createSql: (t) => `CREATE TABLE IF NOT EXISTS ${t} (id INT PRIMARY KEY, name VARCHAR(255))`,
    insertSql: (t, id, name) => `INSERT INTO ${t} (id, name) VALUES (${id}, '${name}')`,
    selectSql: (t) => `SELECT id, name FROM ${t} ORDER BY id`,
    dropSql: (t) => `DROP TABLE IF EXISTS ${t}`,
});
