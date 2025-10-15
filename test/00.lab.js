import { FlashClient } from '../src/db/flash/FlashClient.js';
import { PGClient } from '../src/db/classic/pg/PGClient.js';
import Observer from '@webqit/observer';

const d = () => new Promise((r) => setTimeout(r, 300));


// ------- clients

const client1 = new PGClient;
await client1.connect();

const client2 = new FlashClient({ remoteClientCallback: () => client1 });
await client2.connect();

// ------- INIT

await client1.query('CREATE TABLE IF NOT EXISTS t2 (id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, col1 TEXT, col2 TEXT, col3 TEXT)');
await client1.query('CREATE TABLE IF NOT EXISTS t1 (id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, rel INT REFERENCES t2 (id), col3 TEXT)');

let sql = `
INSERT INTO t2 (col1, col2, col3)
VALUES
    ('a-1', 'b-1', 'one'),
    ('a-2', 'b-2', 'one'),
    ('a-3', 'b-3', 'two'),
    ('a-4', 'b-4', 'two');
INSERT INTO t1 (rel, col3)
VALUES
    (null, 'one'),
    (2, 'one'),
    (3, 'two'),
    (4, 'two')`;
await client1.query(sql);


await client2.query('CREATE TABLE IF NOT EXISTS t3 (id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, rel INT, col3 TEXT)');
sql = `
    INSERT INTO t3 (col3)
    VALUES
        ('threeeeeeee-111'),
        ('threeeeeeee--222')`;
await client2.query(sql);




if (0) {
    //const result = await client1.query('TABLE t1');
    //const result = await client1.query('SELECT MAX(id) FROM t1', { live: true, forceDiffing: false });
    sql = `SELECT id FROM t1 ORDER BY 1 DESC LIMIT 3 OFFSET 1`;
    sql = `SELECT MAX(id) FROM t1 GROUP BY col3`;

    let sql2;

    sql2 = `SELECT id, t1.col3 as a, t2.col3 as b FROM t1 LEFT JOIN t2 ON t1.rel = t2.id WHERE id IS NOT NULL AND (id <> 0) ORDER BY id DESC`;
    //sql2 = `SELECT id, t1.col3 as a, t2.col3 as b FROM t1 LEFT JOIN t2 ON t1.rel = t2.id WHERE id IS NOT NULL AND (0 != id) AND id::boolean AND id::boolean ORDER BY id DESC`;
    sql = `SELECT id, t1.col3 as a, t2.col3 as b FROM t1 LEFT JOIN t2 ON t1.rel = t2.id WHERE id IS NOT NULL AND (0 != id) AND id = 0 ORDER BY id ASC`;




    const options = { forceDiffing: true, noOffsetRevalidate: false };
    const realtimeClient = client1.realtimeClient;

    const result1 = await client1.query(sql, { live: true, ...options });
    console.log(realtimeClient.size, result1.rows);

    const result2 = await client1.query(sql2, { live: true, ...options });
    console.log(realtimeClient.size, result2.rows);

    Observer.observe(result1.rows, Observer.subtree(), (e) => {
        //console.log(':::', e);
    });




    sql = `
    INSERT INTO t2 (col1, col2, col3)
    VALUES
        ('a-5', 'b-5', 'one')`;
    sql = `
    UPDATE t1 SET rel = 1 WHERE id = 1;
    `;
    await client1.query(sql);




    await d();
    console.log('-----------', result1.rows);
    console.log('-----------', result2.rows);
} else {


    //await client2.federate({ public2: { query: `SELECT * FROM t2 WHERE id < 3` } }, { url: 3 });
    await client2.materialize({ public2: { schema: 'public', name: 't2', where: { id: 2 } } }, { url: 3 });
    console.log((await client2.query(`SELECT t3.id, t2.col3 FROM t3 LEFT JOIN t2 ON t3.id = t2.id`, [2])).rows);
}





await client1.query('DROP TABLE IF EXISTS t1 CASCADE');
await client1.query('DROP TABLE IF EXISTS t2 CASCADE');
await client1.disconnect();
process.exit();