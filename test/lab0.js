import 'dotenv/config';
import pg from 'pg';

// Obtain pg client
const client = new pg.Client({
    //connectionString: process.env.DATABASE_URL,
    //database: 'postgres',
});
// Connect
await client.connect();

// -----------------------------

const c = 10;

const records = [
    { id: 100+c, fname: `John-${c}`, email: 'x1@x.com' },
    { id: 150+c, fname: `John-${c+50}`, email: 'x2@x.com' },
];

await client.query('CREATE TABLE IF NOT EXISTS tt (id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, t1 TEXT, t2 TEXT, cat TEXT)');

let sql = `
INSERT INTO tt (t1, t2, cat)
VALUES
    ('a-1', 'b-1', 'one'),
    ('a-2', 'b-2', 'one'),
    ('a-3', 'b-3', 'two'),
    ('a-4', 'b-4', 'two')`;
console.log('________________________', (await client.query(sql)).rows);

console.log('________________________', (await client.query('SELECT SUM(id) idx FROM tt GROUP BY cat HAVING idx > 0')).rows);
await client.query('DROP TABLE tt CASCADE');

process.exit();