import { WorkerPoolManager } from './WorkerPoolManager.js';
import { LinkedQL } from './linkedql.js'; // Your LinkedQL class
import { Observer } from './observer.js';

// --- 1. Instantiate WorkerPoolManager ---
const walSourceDescriptor = {
    type: 'inline',  // or 'broker'
    connection: {
        host: 'localhost',
        user: 'postgres',
        password: 'postgres',
        database: 'mydb'
    },
    slot: 'linkedql_slot',
    tables: ['users', 'posts']
};
const pool = new WorkerPoolManager({
    walSourceDescriptor,
    initialWorkers: 3,
    batchInterval: 50,
    scaleCheckInterval: 500,
    maxLoadPerWorker: 10
});

// --- 2. Create LinkedQL instance pointing to the pool as WAL source ---
const linkedQL = new LinkedQL({ walSource: pool });

// --- 3. Subscribe to live query ---
const users = linkedQL.query('SELECT * FROM users');
Observer.observe(users, (patch) => {
    console.log('Live patch received:', patch);
});

// --- 4. Subscribe another query to test multiple subscriptions ---
const posts = linkedQL.query('SELECT * FROM posts');
Observer.observe(posts, (patch) => {
    console.log('Posts patch:', patch);
});


// -------------------------------------------------------------------------------
// For demonstration purposes, simulate some WAL events
// In a real scenario, these would come from the database via logical replication
// ------------------------------------------------------------------------------


// --- 6. Example: simulate WAL events (for testing) ---
function simulateWalEvent(table, data) {
    // Find worker handling table
    const worker = pool.subscriptions.get(table);
    if (worker) worker.send({ type: 'patch', table, patch: data });
}

// Simulate users table updates every 100ms
setInterval(() => {
    simulateWalEvent('users', { id: Math.floor(Math.random() * 1000), name: 'User' + Math.floor(Math.random() * 100) });
}, 100);

// Simulate posts table updates every 150ms
setInterval(() => {
    simulateWalEvent('posts', { id: Math.floor(Math.random() * 1000), title: 'Post' + Math.floor(Math.random() * 100) });
}, 150);
