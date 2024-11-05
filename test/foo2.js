import pg from 'pg';
import { SQLClient, Parser } from '../src/index.js';
import { SelectStatement } from '../src/lang/dql/SelectStatement.js';

const driver = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await driver.connect();
const client = new SQLClient({
    query(...args) {
        //console.log('>>>>>>>>', args[0]);
        return driver.query(...args)
    }
}, { dialect: 'postgres' });

/*
const rootSchema = await client.schema({ depth: 2, inSearchPathOrder: true });
console.log(JSON.stringify(rootSchema, null, 2));
console.log((await client.driver.query(`INSERT INTO users (name, email) VALUES ('name1', 'email1'), ('name2', 'email2')`)).rows);
console.log((await client.driver.query(`SELECT json_object(array['name', name]) AS rrr from users`)).rows);
*/

//console.log(await driver.query('SELECT u.name FROM users as U LEFT JOIN roles on ROLES.id = u.role'));
await client.withSchema(async () => {

    // Start with basic form
    const result00 = Parser.parse(client, `UPSERT INTO users (name, email) VALUES ('name1', 'email1'), ('name2', 'email2')`, null, { inspect: false });
    console.log('\n\n\n>>', result00 + '', '\n>>', result00.deSugar() + '\n\n\n');

    // Start with basic form
    const result0 = Parser.parse(client, `SELECT name + name, name, role ~> name FROM users`, null, { inspect: false });
    console.log('\n\n\n>>', result0 + '', '\n>>', result0.deSugar() + '\n\n\n');

    // Alias the base table. Should work whether written as u.role ~> name or role ~> name
    const result2 = Parser.parse(client, `SELECT name, role ~> name as a FROM users as u`, null, { inspect: false });
    console.log('\n\n\n>>', result2 + '', '\n>>', result2.deSugar() + '\n\n\n');

    // Introduce joins. Should throw an ambiguity error if not written as u.role ~> name
    const result3 = Parser.parse(client, `SELECT u.name, u.role ~> name as a FROM users as u LEFT JOIN users AS u2 ON u.id = u2.id`, null, { inspect: false });
    console.log('\n\n\n>>', result3 + '', '\n>>', result3.deSugar() + '\n\n\n');

    // Abstract the base table. Should work provided the relevant fields are present
    const result4 = Parser.parse(client, `SELECT name, rb ~> name as a FROM (SELECT name, ra AS rb FROM (SELECT name, role AS ra FROM users as u0) as u1) as u`, null, { inspect: false });
    console.log('\n\n\n>>', result4 + '', '\n>>', result4.deSugar() + '\n\n\n');



    // Start with basic form
    const result5 = Parser.parse(client, `SELECT name, role <~ users ~> id FROM roles`, null, { inspect: false });
    console.log('\n\n\n>>', result5 + '', '\n>>', result5.deSugar() + '\n\n\n');

    // Alias the base table. Should work even with base table now having an alias: roles as r
    const result6 = Parser.parse(client, `SELECT name, role <~ users ~> id FROM roles as r`, null, { inspect: false });
    console.log('\n\n\n>>', result6 + '', '\n>>', result6.deSugar() + '\n\n\n');

    // Introduce joins. Should throw an ambiguity error if joined with an identical table for the relationship: LEFT JOIN roles AS r2 ON r.id = r2.id
    const result7 = Parser.parse(client, `SELECT r.name, role <~ users ~> id FROM roles as r`, null, { inspect: false });
    console.log('\n\n\n>>', result7 + '', '\n>>', result7.deSugar() + '\n\n\n');
    
   // Abstract the base table. Should work provided the relevant fields are present
    const result8 = Parser.parse(client, `SELECT {name}, role <~ users ~> id FROM (SELECT * FROM (SELECT id FROM roles as r0) as r1) as r`, null, { inspect: false });
    console.log('\n\n\n>>', result8 + '', '\n>>', result8.deSugar() + '\n\n\n');
    
   // Abstract the base table. Should work provided the relevant fields are present
   const result9 = Parser.parse(client, `SELECT name, role <~ author <~ books ~> title FROM roles`, null, { inspect: true });
   console.log('\n\n\n>>', result9 + '', '\n>>', result9.deSugar() + '\n\n\n');
   
    return;
});








const result1 = Parser.parse(client, `SELECT gggg:[d,d] as a, dd<~d~>l, kfk~>ffk, {a,b,c,a+e as d} "ff""f", '' r, sum(all    cols) as cols From a a, b b`, null, { inspect: false });






//console.log('\n\n\n', result1.deSugar() + '');
const result8 = Parser.parse({}, `Grant priv to kk`, null, { inspect: true });
console.log('\n\n\n',  result8 + '');

const query = new SelectStatement({});
query.fields('col1');
query.fields('col2', 'col3');
query.fields(q => q.expr('col4'));
query.fields(q => q.expr(['base5','col/5']).as('s"s'), { expr: { sum: ['col6'], orderBy: [{ expr: 'r', direction: 'asc' }, { expr: 'rr', direction: 'desc' }], over: 'win' }, as: 'o+o'});
query.fields().add('wq', { sum: ['first', 'second', { sum: ['sub-first', 'sub-second'] }] });
query.where(q => q.eq('a', 'b'), { isNull: 'c' }, { some: [
    { caseFor: ['a', { when: 2, then: 'e' } ], else: 'f' },
    { eq: ['aa', 3] },
    { lt: ['o', { join: ['a', 'b'] }]}
] });

console.log('\n\n\n',  query + '');
console.log('\n\n\n', query.deSugar() + '');


process.exit();
