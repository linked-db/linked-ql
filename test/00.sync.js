import { EdgeClient } from '../src/clients/edge/EdgeClient.js';
import { EdgeWorker } from '../src/clients/edge/remote/EdgeWorker.js';
import { InMemoryKV } from '@webqit/keyval/inmemory';
import { FlashQL } from '../src/flashql/FlashQL.js';
import Observer from '@webqit/observer';
import { PGClient } from '../src/clients/postgres/PGClient.js';


const pg = new PGClient;
await pg.connect();
pg.on('error', (e) => {
  console.log('||||||||pg', e);
});

console.log((await pg.parser.parse(`SELECT set_config('claims.user_id', 'user_abc_123', true);`)));


console.log(`\n\nStage 1:________________________________________\n\n`);
/**
 * This is DB1 - the upstream DB.
 * Has a table called public.users
 */

const keyval = new InMemoryKV({ path: ['test'] });
const db1 = new FlashQL({ keyval });
await db1.connect();
db1.on('error', (e) => {
  console.log('||||||||db1', e);
});

await db1.query(`
  -- Define tables explicitly
  CREATE TABLE users (
    id INT PRIMARY KEY,
    name TEXT
  );

  -- Seed local data
  INSERT INTO users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus');
`);

setTimeout(async () => {
  console.log('\n\nINSERT 1:________________________________________\n\n');

  await db1.query(`
    INSERT INTO users (id, name)
    VALUES (3, 'Ada 2'), (4, 'Linus 2');
    UPDATE users SET name = 'Jude' WHERE id = 1;
  `);
}, 400);

setTimeout(async () => {
  console.log('\n\nINSERT 2:________________________________________\n\n');

  await db1.query(`
    INSERT INTO users (id, name)
    VALUES (5, 'Ada 20'), (6, 'Linus 20');
    UPDATE users SET name = 'James' WHERE id = 2;
  `);
}, 800);

const mc1 = new MessageChannel;
EdgeWorker.webWorker({ db: db1 }).runIn(mc1.port2);






/**
 * This is DB2 - the downstream DB.
 * Has a table called offline.users mirroring upstream's public.users
 */

const db2 = new FlashQL({ getUpstreamClient: () => new EdgeClient({ worker: mc1.port1, type: 'worker' }), });
await db2.connect();
db2.on('error', (e) => {
  console.log('||||||||db2', e);
});

await db2.query(`
  CREATE SCHEMA offline;
  CREATE REALTIME VIEW offline.users AS
  -- SELECT *, xmin AS "XMIN" FROM public.users
  -- SELECT id, name, xmin FROM public.users
  TABLE public.users
  WITH(replication_origin = 'flashql:primary')
`);


const tx = await db2.begin();
const result2 = await db2.query(`
  SELECT
    u.id,
    u.name
  FROM offline.users u
  WHERE false != true
`, { live: true, id: 'w', tx, values: [] });

console.log(`\n\nInitial: ${result2.mode}________________________________________\n\n`);
console.log(result2.rows);

await new Promise((r) => setTimeout(r, 600));
console.log(`\n\nStage 1:________________________________________\n\n`);
console.log(result2.rows);
await result2.abort({ forget: false });









await new Promise((r) => setTimeout(r, 1200));
console.log(`\n\nStage 1 (confirmation):________________________________________\n\n`);
console.log(result2.rows);

const result3 = await db2.query(`
  SELECT
    u.id,
    u.name
  FROM offline.users u
  WHERE true != false
`, { live: true, id: 'w', tx });

console.log(`\n\nResumption: ${result3.mode}________________________________________\n\n`);
console.log(result3.rows);

await new Promise((r) => setTimeout(r, 600));
console.log(`\n\nStage 2:________________________________________\n\n`);
console.log(result3.rows);