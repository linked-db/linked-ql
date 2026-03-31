import { EdgeClient } from '../src/clients/edge/EdgeClient.js';
import { EdgeWorker } from '../src/clients/edge/EdgeWorker.js';
import { FlashQL } from '../src/flashql/FlashQL.js';


/**
 * This is DB1 - the upstream DB.
 * Has a table called public.users
 */

const db1 = new FlashQL;
await db1.connect();

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

const mc = new MessageChannel;
EdgeWorker.webWorker({ db: db1, worker: mc.port2, type: 'worker' });






/**
 * This is DB2 - the downstream DB.
 * Has a table called offline.users mirroring upstream's public.users
 */

const db2 = new FlashQL({ onCreateForeignClient: () => new EdgeClient({ worker: mc.port1, type: 'worker' }), });
await db2.connect();

await db2.query(`
  CREATE SCHEMA offline;
  CREATE TEMPORARY REALTIME VIEW offline.users AS
  SELECT * FROM public.users
  WITH(replication_origin = 'primary')
`);



console.log('\n\n________________________________________\n\n');

const result2 = await db2.query(`
  SELECT
    u.id,
    u.name
  FROM offline.users u
`, { live: true });

console.log(result2.rows);

console.log('\n\n________________________________________\n\n');

await db1.query(`
  INSERT INTO users (id, name)
  VALUES (3, 'Ada 2'), (4, 'Linus 2');
  UPDATE users SET name = 'Jude' WHERE id = 1;
`);

await new Promise((r) => setTimeout(r, 20));

console.log(result2.rows);