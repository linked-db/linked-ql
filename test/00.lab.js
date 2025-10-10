import { matchSchemaSelector, normalizeSchemaSelectorArg } from '../src/db/abstracts/util.js';
import { StorageEngine } from '../src/db/flash/StorageEngine.js';
import { FlashClient } from '../src/db/flash/FlashClient.js';
import { PGClient } from '../src/db/classic/pg/PGClient.js';
import Observer from '@webqit/observer';


const client = new FlashClient({ enableLive: true });
await client.connect();

const d = () => new Promise((r) => setTimeout(r, 1000));
const options = { forceDiffing: true, noOffsetRevalidate: false };

await client.query('CREATE SCHEMA IF NOT EXISTS public');
await client.query('CREATE TABLE IF NOT EXISTS t1 (id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, col1 TEXT, col2 TEXT, col3 TEXT)');
let sql = `
INSERT INTO t1 (col1, col2, col3)
VALUES
    ('a-1', 'b-1', 'one'),
    ('a-2', 'b-2', 'one'),
    ('a-3', 'b-3', 'two'),
    ('a-4', 'b-4', 'two')`;
await client.query(sql);
await d();



//const result = await client.query('TABLE t1');
//const result = await client.query('SELECT MAX(id) FROM t1', { live: true, forceDiffing: false });

sql = `SELECT id FROM t1 ORDER BY 1 DESC LIMIT 3 OFFSET 1`;
sql = `SELECT MAX(id) FROM t1 GROUP BY col3`;
sql = `SELECT id FROM t1 LEFT JOIN t1 AS t2 ON t1.id = t2.id`;




const result = await client.query(sql, { live: true, ...options });
console.log('-----------', result.rows);
Observer.observe(result.rows, (e) => {
    //console.log(':::', e);
}, { subtree: true });





sql = `
INSERT INTO t1 (col1, col2, col3)
VALUES
    ('a-5', 'b-5', 'one')`;
await client.query(sql);




await d();
console.log('-----------', result.rows);






await client.query('DROP TABLE t1 CASCADE');
process.exit();