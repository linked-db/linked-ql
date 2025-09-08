import net from 'node:net';
import { LogicalReplicationService, Wal2JsonPlugin } from 'pg-logical-replication';

if (!process.env.WAL_SOURCE) {
    console.error('Broker missing WAL_SOURCE config in env; exiting');
    process.exit(1);
}
const WAL_SOURCE = JSON.parse(process.env.WAL_SOURCE);
const PORT = Number(WAL_SOURCE.port) || 8123;

const subscriptions = new Map; // table -> Set(sockets)
const workers = new Set;
let bufferQueue = new Map; // table -> [patches] used for batched fan-out
const FANOUT_INTERVAL = 50; // ms

// TCP server for workers to connect and subscribe
const server = net.createServer((socket) => {
    workers.add(socket);
    socket.setEncoding('utf8');

    socket.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
            try {
                const msg = JSON.parse(line);
                if (msg.type === 'subscribe') {
                    if (!subscriptions.has(msg.table)) {
                        subscriptions.set(msg.table, new Set());
                    }
                    subscriptions.get(msg.table).add(socket);
                    // optionally send a snapshot request to DB or maintain snapshot cache
                } else if (msg.type === 'unsubscribe') {
                    subscriptions.get(msg.table)?.delete(socket);
                    if (!subscriptions.get(msg.table)?.size) {
                        subscriptions.delete(msg.table);
                    }
                }
            } catch (err) {
                console.error('[broker] bad msg', err);
            }
        }
    });

    socket.on('close', () => {
        workers.delete(socket);
        for (const subs of subscriptions.values()) {
            subs.delete(socket);
        }
    });

    socket.on('error', (err) => {
        console.error('[broker] worker socket err', err);
        workers.delete(socket);
        for (const subs of subscriptions.values()) {
            subs.delete(socket);
        }
    });
});

server.listen(PORT, () => console.log(`[broker] listening on ${PORT}`));

// batched fan-out: flush queue to all subscribed sockets
setInterval(() => {
    for (const [table, arr] of bufferQueue.entries()) {
        if (!arr.length) continue;
        const msg = JSON.stringify({ type: 'patch', table, data: arr.splice(0) }) + '\n';
        const subs = subscriptions.get(table);
        if (!subs) continue;
        for (const sock of subs) {
            try { sock.write(msg); } catch (e) { /* ignore */ }
        }
    }
}, FANOUT_INTERVAL);

// WAL consumer using pg-logical-replication
async function startWALConsumer() {
    const client = new LogicalReplicationService({
        connection: WAL_SOURCE.connection,
        slotName: WAL_SOURCE.slot,
        plugin: new Wal2JsonPlugin({}),
    });

    client.on('data', (lsn, log) => {
        if (!log || !log.change) return;
        for (const change of log.change) {
            const table = change.table;
            if (!bufferQueue.has(table)) {
                bufferQueue.set(table, []);
            }
            bufferQueue.get(table).push(change);
        }
    });

    await client.start();
    console.log('[broker] WAL consumer started on slot', WAL_SOURCE.slot);
    client.on('error', (err) => console.error('[broker] WAL error', err));
}

startWALConsumer().catch(err => {
    console.error('[broker] failed to start WAL consumer', err);
    process.exit(1);
});
