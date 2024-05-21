  
/**
 * @imports
 */
import Lexer from '@webqit/util/str/Lexer.js';
import { expect } from 'chai';
import Parser from '../src/query/Parser.js';
import pg from 'pg';
import SQLClient from '../src/api/sql/SQLClient.js';
import Select from '../src/query/select/Select.js';

const pgClient = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await pgClient.connect();
const sqlClient = new SQLClient(pgClient, { dialect: 'postgres' });

//const dd = `'kk' || "table_schema" || '...' || case WHEN 4=3 THEN '5' ELSE '--...' || 6 END`;
//console.log('..........', await pgClient.query(`SELECT ${ dd } dd, 'You''re cool' ffff, 4 is distinct from 4, (CASE WHEN 4=3 THEN 5 ELSE 6 END)f_f from information_schema.tables limit 1`));


describe(`SELECT QUERIES`, function() {

    const expr1 = `SELECT ALL aaaa::int, cast(col1 as text), a ~> b -> '{c,d}', "bbb"."bb" "a li", age || \'kk\' || table_schema || \'...\' || $2 concatenation, 5 + 5 "s..|""um", 'You''re cool' ffff, JSON_AGG('{dd:2}') is distinct from 4, CASE subject WHEN a=1 THEN 'one' END ff, SUM(all id order by rrrrrr), (SELECT GG AS INNERALIAS FROM jj) ALIAS FROM (SELECT age as aaaa, time2 as bbbbb from table2 as t2) ta WHERE kk = 4 order by CASE WHEN 4=3 THEN 5 ELSE 6 END desc with rollup`;
    describe(`Parse a complex select statement`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            const query1 = await Parser.parse({}, expr1, null, { explain: false });
            const query2 = Select.fromJson(query1.CONTEXT, query1.toJson());
            const sql1 = query1 + '';
            const sql2 = query2 + '';
            console.log(sql1);
            /*
            console.log(sql2);
            console.log(JSON.stringify(query1.toJson(), null, 3));
            console.log(JSON.stringify(query2.toJson(), null, 3));
            */
            expect(sql1).to.eq(sql2);
        });

        it(`"Build a query with the imperative api and stringify`, async function() {
            const query1 = new Select(sqlClient);
            // JSON forms
            query1.select(
                // Pass in a fully-qualified identifier object
                { expr: { name: ['base1','col1'] }, alias: 'alias1' },
                // Pass in an identifier string
                { expr: 'col2' },
                { expr: 'col3', alias: 'alias3' },
                // Skip the nesting to the identifier part
                { name: ['base4','col4'] },
                // Just string
                'col5',
            );
            // Callback forms
            query1.select(
                // Pass in a fully-qualified identifier object
                field => field.expr({ name: ['base6','col-6'] }).as('alias6/1'),
                // Use a callback there too
                field => field.expr(
                    q => q.name(['base6','col-6'])
                ).as('alias6/2'),
                // Pass in an identifier string
                field => field.expr('col7').as('alias7'),
                // Skip the nesting to the identifier part
                field => field.name('col8'),
                // Include a basename
                field => field.name(['base9','col9']),
                // Include an alias
                field => field.name(['base+10','col.10']).as('$alias10'),
                // Try more complex expressions
                field => field.expr(
                    // Use magic method
                    q => q.sum('col11', 'col12')
                ).as('sum'),
                field => field.expr(
                    // Use magic method
                    q => q.equals('col13', 'col14')
                ).as('assertion1'),
                field => field.expr(
                    // Use magic method
                    q => q.isDistinctFrom('col13', 'col14')
                ).as('assertion2'),
                field => field.case(
                    // Use magic method
                    c => c.compare('col15'),
                    c => c.when(null).then_('col16'),
                    c => c.when(false).then_('col16'),
                    c => c.else(true)
                ).as('assertion2'),
                field => field.query(
                    q => q.select('id'),
                    q => q.from(['base0','t1'], ['base0','t2']),
                    q => q.leftJoin( q => q.name('j1') ).as('j1').using('correlation1'),
                    q => q.crossJoin(['base2','j2']).as('j2').on(
                        q => q.equals(['j2','col1'], ['j1','col1'])
                    ),
                ).as('subValue', false),
                field => field.call('max', q => q.cast('col2', 'text', true)).as('MX'),
                field => field.expr(
                    q => q.call('max', 'col2').over(),
                ).as('MX'),
                //field => field.path('author1', '~>', q => q.path('parent', '~>', 'fname')).as('path'),
                field => field.path('parent', '<~', q => q.path('author1', '<~', q => q.path(['new_db_name','books'], '~>', 'isbn'))),//.as('path1'),
                field => field.path('parent', '<~', q => q.path(['new_db_name','users'], '~>', 'fname')),//.as('path2'),
                field => field.path('author1', '<~', q => q.path(['new_db_name','books'], '~>', 'isbn')),//.as('path3'),
                field => field.path('author1', '<~', q => q.path(['new_db_name','books'], '~>', q => q.path('isbn', '->', 3))),//.as('path3'),
            )
            //query1.from(['new_db_name','books']).as('base_alias');
            query1.from(['new_db_name','users']).as('base_alias');
            await query1.expand();
            const sql1 = query1 + '';
            console.log(sql1);
            /*
            console.log(sql2);
            console.log(JSON.stringify(query1.toJson(), null, 3));
            console.log(JSON.stringify(query2.toJson(), null, 3));
            */
            //expect(sql1).to.eq(sql2);
        });

        it('.......................', async function() {
            const forward = false;
            const dbName = ['OBJ_INFOSCHEMA_DB','database_savepoints'];
            const q = new Select(sqlClient);
            console.log('........................', q + '');
        });

    });

});