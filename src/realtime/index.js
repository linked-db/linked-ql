import { LogicalReplicationService, Wal2JsonPlugin } from 'pg-logical-replication';

export async function startLogicalReplication({ slot, onChange }) {
    const client = new LogicalReplicationService({
        connection: {
            host: 'localhost',
            user: 'postgres',
            password: 'postgres',
            database: 'mydb',
        },
        plugin: new Wal2JsonPlugin({}),
        slotName: slot,
    });

    client.on('data', (lsn, log) => {
        for (const change of log.change) {
            onChange(change);
        }
    });

    await client.start();
}

await startLogicalReplication({
    slot: 'webflo_slot',
    onChange(change) {
        linkedQLLiveResult.apply(change);
    }
});