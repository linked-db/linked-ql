import { InlineWALSource } from './InlineWALSource.js';
import { BrokerWALSource } from './BrokerWALSource.js';
import { Observer } from './observer.js';

if (!process.env.WAL_SOURCE) {
    console.error('Worker missing WAL_SOURCE config in env; exiting');
    process.exit(1);
}
const WAL_SOURCE = JSON.parse(process.env.WAL_SOURCE);
const BATCH_INTERVAL = Number(process.env.BATCH_INTERVAL) || 50;
const QUEUE_REPORT_INTERVAL = Number(process.env.QUEUE_REPORT_INTERVAL) || 200;

let walSource;
const patchBuffer = new Map; // table -> [patches]
const subscribers = new Set; // table names handled by this worker

function bufferPatch(table, patch) {
    if (!patchBuffer.has(table)) {
        patchBuffer.set(table, []);
    }
    patchBuffer.get(table).push(patch);
}

function flushBuffers() {
    for (const [table, arr] of patchBuffer.entries()) {
        if (!arr.length) continue;
        process.send?.({ type: 'patch', table, data: arr.splice(0) });
    }
}

function reportQueueLength() {
    const total = [...patchBuffer.values()].reduce((s, a) => s + a.length, 0);
    process.send?.({ type: 'queueLength', length: total });
}

(async () => {
    if (WAL_SOURCE.type === 'inline') {
        walSource = new InlineWALSource({
            connection: WAL_SOURCE.connection,
            slot: WAL_SOURCE.slot
        });
        await walSource.start();
    } else {
        walSource = new BrokerWALSource({
            host: WAL_SOURCE.host,
            port: WAL_SOURCE.port
        });
        walSource.connect();
    }

    const tables = WAL_SOURCE.tables || [];
    for (const table of tables) {
        subscribers.add(table);
        walSource.subscribe(table, (change) => {
            // If broker gave a snapshot wrapper, handle it specially
            if (change && change.__snapshot) {
                // initial snapshot: set entire result set (replace)
                // Observer expects an array; we push each row as a patch for simplicity
                const rows = change.rows || [];
                for (const r of rows) {
                    Observer.set(table, { __init: true, row: r });
                }
                // also inform parent via snapshot message
                process.send?.({ type: 'snapshot', table, snapshot: rows });
                return;
            }

            // Normal WAL change; push into local observer and buffer it for parent
            Observer.set(table, change);
            bufferPatch(table, change);
        });
    }

    setInterval(flushBuffers, BATCH_INTERVAL);
    setInterval(reportQueueLength, QUEUE_REPORT_INTERVAL);

    process.on('message', (msg) => {
        if (!msg || !msg.type) return;
        if (msg.type === 'request_snapshot' && msg.table) {
            const data = Observer.get(msg.table);
            process.send?.({ type: 'snapshot', table: msg.table, data });
        }
    });

    console.log('[worker] started with WAL source', WAL_SOURCE.type, 'tables', tables);
})();
