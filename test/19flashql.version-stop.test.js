import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

import '../src/lang/index.js';
import { FlashQL } from '../src/flashql/FlashQL.js';
import { StorageEngine } from '../src/flashql/storage/StorageEngine.js';
import { InMemoryKV } from '@webqit/keyval/inmemory';

describe('FlashQL - versionStop boot mode', () => {
    it('boots read-only at requested historical version', async () => {
        const registry = new Map();
        const path = ['linkedql-flashql-version-stop-ro'];

        const seed = new StorageEngine({ keyval: new InMemoryKV({ path, registry }) });
        await seed.open();
        await seed.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'snap_tbl',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });
        await seed.transaction(async (tx) => {
            await tx.getRelation({ namespace: 'public', name: 'snap_tbl' }).insert({ id: 1 });
        });
        await seed.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'snap_tbl' }, { name: 'snap_tbl_tmp' });
        });
        await seed.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'snap_tbl_tmp' }, { name: 'snap_tbl' });
        });
        await seed.transaction(async (tx) => {
            await tx.getRelation({ namespace: 'public', name: 'snap_tbl' }).insert({ id: 2 });
        });
        await seed.close({ destroy: false });

        const historical = new FlashQL({
            keyval: new InMemoryKV({ path, registry }),
            versionStop: 'public.snap_tbl@1',
        });
        await historical.connect();

        const rows = (await historical.query('SELECT id FROM public.snap_tbl ORDER BY id')).rows;
        expect(rows.map((r) => r.id)).to.deep.eq([1]);
        expect(historical.storageEngine.readOnly).to.be.true;
        await expect(historical.query('INSERT INTO public.snap_tbl (id) VALUES (3)')).to.be.rejectedWith('read-only');

        await historical.disconnect();
    });

    it('overwriteForward keeps full history until first mutation then truncates forward', async () => {
        const registry = new Map();
        const path = ['linkedql-flashql-version-stop-overwrite'];

        const seed = new StorageEngine({ keyval: new InMemoryKV({ path, registry }) });
        await seed.open();
        await seed.transaction(async (tx) => {
            await tx.createTable({
                namespace: 'public',
                name: 'snap_tbl',
                columns: [{ name: 'id', type: 'INT', not_null: true }],
                constraints: [{ kind: 'PRIMARY KEY', columns: ['id'] }],
            });
        });
        await seed.transaction(async (tx) => {
            await tx.getRelation({ namespace: 'public', name: 'snap_tbl' }).insert({ id: 1 });
        });
        await seed.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'snap_tbl' }, { name: 'snap_tbl_tmp' });
        });
        await seed.transaction(async (tx) => {
            await tx.alterTable({ namespace: 'public', name: 'snap_tbl_tmp' }, { name: 'snap_tbl' });
        });
        await seed.transaction(async (tx) => {
            await tx.getRelation({ namespace: 'public', name: 'snap_tbl' }).insert({ id: 2 });
        });
        await seed.close({ destroy: false });

        const historicalWritable = new FlashQL({
            keyval: new InMemoryKV({ path, registry }),
            versionStop: 'public.snap_tbl@1',
            overwriteForward: true,
        });
        await historicalWritable.connect();

        const beforeMutation = new FlashQL({ keyval: new InMemoryKV({ path, registry }) });
        await beforeMutation.connect();
        const beforeRows = (await beforeMutation.query('SELECT id FROM public.snap_tbl ORDER BY id')).rows;
        expect(beforeRows.map((r) => r.id)).to.deep.eq([1, 2]);
        await beforeMutation.disconnect();

        await historicalWritable.query('INSERT INTO public.snap_tbl (id) VALUES (3)');
        await historicalWritable.disconnect();

        const verify = new FlashQL({ keyval: new InMemoryKV({ path, registry }) });
        await verify.connect();
        const rows = (await verify.query('SELECT id FROM public.snap_tbl ORDER BY id')).rows;
        expect(rows.map((r) => r.id)).to.deep.eq([1, 3]);
        await verify.disconnect();
    });
});
