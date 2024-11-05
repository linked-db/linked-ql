import pg from 'pg';
import { expect } from 'chai';
import { Parser, SQLClient } from '../src/index.js';
import { SelectStatement } from '../src/lang/dql/SelectStatement.js';

describe(`SELECT QUERIES`, function() {

    const expr1 = `SELECT ALL aaaa::int, cast(col1 as text), a ~> b -> '{c,d}', "bbb"."bb" "a li", age || \'kk\' || table_schema || \'...\' || $2 concatenation, 5 + 5 "s..|""um", 'You''re cool' ffff, JSON_AGG('{dd:2}') is distinct from 4, CASE subject WHEN a=1 THEN 'one' END ff, SUM(all id order by rrrrrr), (SELECT GG AS INNERALIAS FROM jj) ALIAS FROM (SELECT age as aaaa, time2 as bbbbb from table2 as t2) ta WHERE kk = 4 order by CASE WHEN 4=3 THEN 5 ELSE 6 END desc with rollup`;
    describe(`Parse a complex select statement`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            const query1 = await Parser.parse({}, expr1, null, { inspect: true });
            const query2 = SelectStatement.fromJSON(query1.CONTEXT, query1.toJSON());
            const sql1 = query1 + '';
            const sql2 = query2 + '';
            console.log(sql1);
            /*
            console.log(sql2);
            console.log(JSON.stringify(query1.toJSON(), null, 3));
            console.log(JSON.stringify(query2.toJSON(), null, 3));
            */
            expect(sql1).to.eq(sql2);
        });

        it(`"Build a query with the imperative api and stringify`, async function() {
            const query1 = new SelectStatement({ name: 'some_database', params: { inputDialect: 'postgres', dialect: 'mysql' } });
            // JSON forms
            query1.fields(
                // Pass in a fully-qualified identifier object
                { expr: { prefix: 'base1', name: 'col1', }, alias: 'alias1' },
                // Pass in an identifier string
                { expr: 'col2' },
                { expr: 'col3', alias: 'alias3' },
                // Skip the nesting to the identifier part
                { prefix: 'base4', name: 'col4' },
                // Just string
                'col5',
            );
            // Callback forms
            query1.fields(
                // Pass in a fully-qualified identifier object
                field => field.expr({ prefix: 'base6', name: 'col-6' }).as('alias6/1'),
                // Use a callback there too
                field => field.expr(
                    q => q.prefix('base6').name('col-6')
                ).as('alias6/2'),
                // Pass in an identifier string
                field => field.expr('col7').as('alias7'),
                // Skip the nesting to the identifier part
                field => field.expr('col8'),
                // Include a basename
                field => field.expr(['base9','col9']),
                // Include an alias
                field => field.expr(['base+10','col.10']).as('$alias10'),
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
                field => field.expr(
                    q => q.caseFor('col15',
                        // Use magic method
                        c => c.when(q => q.null()).then('col16'),
                        c => c.when(q => q.false()).then('col16'),
                    ).else(q => q.true())
                ).as('assertion3'),
                field => field.expr(q => {
                    const $q = q.select('id').from(['base0','t1'], ['base0','t2']);
                    $q.leftJoin( q => q.name('j1') ).as('j1').using('correlation1');
                    $q.crossJoin(['base2','j2']).as('j2').on(
                        q => q.equals(['j2','col1'], ['j1','col1'])
                    );
                }).as('subValue', false),
                field => field.expr(
                    q => q.fn('max', q => q.cast('col2', 'text', true))
                ).as('MX1'),
                field => field.expr(
                    q => q.fn('max', 'col2').over(),
                ).as('MX2'),
                //field => field.path('author1', '~>', q => q.path('parent', '~>', 'fname')).as('path'),
                field => field.expr(
                    q => q.path(q => q.path(q => q.path('parent', '<~', 'author1'), '<~', ['new_db_name','books']), '~>', 'isbn'),
                ),//.as('path1'),
                field => field.expr(
                    q => q.path(q => q.path('parent', '<~', ['new_db_name','users']), '~>', 'fname')
                ),//.as('path2'),
                field => field.expr(
                    q => q.path(q => q.path('author1', '<~', ['new_db_name','books']), '~>', 'isbn')
                ),//.as('path3'),
                field => field.expr(
                    q => q.path(q => q.path('author1', '<~', ['new_db_name','books']), '~>', q => q.path('isbn', '->', 3))
                ),//.as('path3'),
            )
            query1.union(q => q.expr('a'));
            globalThis.dd = 3;
            query1.from(q => q.expr(['new_db_name','users']).as('base_alias'));
            //await query1.expand();
            const sql1 = query1 + '';
            console.log(sql1);
            /*
            console.log(sql2);
            console.log(JSON.stringify(query1.toJSON(), null, 3));
            console.log(JSON.stringify(query2.toJSON(), null, 3));
            */
            //expect(sql1).to.eq(sql2);
        });
        
    });

});