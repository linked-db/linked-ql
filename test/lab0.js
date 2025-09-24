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

sql = `
INSERT INTO lq_test_public.tbl1 (id, fname, email)
VALUES
    (${records[0].id}, '${records[0].fname}', '${records[0].email}'),
    (${records[1].id}, '${records[1].fname}', '${records[1].email}')`;
console.log('________________________', (await client.query(sql)).rows);

process.exit();