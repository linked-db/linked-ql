import { matchSchemaSelector, normalizeSchemaSelectorArg } from '../src/db/abstracts/util.js';
import { StorageEngine } from '../src/db/flash/StorageEngine.js';
import { FlashClient } from '../src/db/flash/FlashClient.js';
import { PGClient } from '../src/db/classic/pg/PGClient.js';


const client = new PGClient;
await client.connect();

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



//const result = await client.query('TABLE t1');
const result = await client.query('SELECT MAX(id) FROM t1', { live: true, forceDiffing: true });
console.log('-----------ffff', result.rows);


await client.query('DROP TABLE t1 CASCADE');
process.exit();