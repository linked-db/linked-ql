
import pg from 'pg';
import SQLClient from '../src/api/sql/SQLClient.js';

const pgClient = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await pgClient.connect();
const sqlClient = new SQLClient(pgClient, { dialect: 'postgres' });

export default function() {
    return sqlClient;
}