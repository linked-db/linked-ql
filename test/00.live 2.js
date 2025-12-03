import { PGClient } from '../src/entry/postgres/PGClient.js';

const client1 = new PGClient;
await client1.connect();


const sql = `
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
`;

const result = await client1.query(sql);
console.log(result.rows);

//await client1.query(`SELECT pg_drop_replication_slot('linkedql_default_slot')`);
//console.log((await client1.query(`SELECT * FROM pg_replication_slots`)).rows);

//const result2 = await client1.query(`UPDATE rrr SET fname = 'John Doe 22' WHERE id = 3`);
//const result2 = await client1.query(`DELETE FROM rrr WHERE id = 1`);
const result3 = await client1.query(`INSERT INTO rrr (fname) VALUES ('John Doe 222---222')`);
await client1.disconnect();