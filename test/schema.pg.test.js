 
/**
 * @imports
 */
import pg from 'pg';
import { expect } from 'chai';
import SQLClient from '../src/api/sql/SQLClient.js';
import CreateStatement from '../src/lang/ddl/create/CreateStatement.js';
import AlterStatement from '../src/lang/ddl/alter/AlterStatement.js';
import TableSchema from '../src/lang/schema/tbl/TableSchema.js';
import Parser from '../src/lang/Parser.js';

// --------------------------
const pgClient = new pg.Client({
    host: 'localhost',
    port: 5432,
});
await pgClient.connect();
let $pgClient = { query(sql, ...args) {
    //console.log(`\n\n\n\nSQL:`, sql);
    return pgClient.query(sql, ...args);
} };
const sqlClient = new SQLClient($pgClient, { dialect: 'postgres' });
// --------------------------

describe(`Postgres Create Table & Alter Table statements`, function() {

    describe(`Create Table`, function() {

        it(`DO: Parses a Create Table statement`, async function() {
            const createTableSql = `
            CREATE TABLE IF NOT EXISTS public."te ""st0" (
                id int PRIMARY    KEY CONSTRAINT genn generated by default as identity default geer(11) check (kkd(dkdk)),
                "$ref" int CONSTRAINT nn not    null CONSTRAINT uni_q unique CONSTRAINT fk REFERENCES pretest (id) MATCH FULL ON DELETE RESTRICT ON UPDATE SET NULL,
                ref2 int unique,
                rand VARCHAR (11) CHECK (rand IS NOT NULL),
                rand2 text null,
                timee timestamp on update CURRENT_TIMESTAMP,
                CONSTRAINT ck CHECK (ref > 10),
                CONSTRAINT "fk .. "" .. 2" FOREIGN    KEY (ref2) REFERENCES pretest2 (id),
                UNIQUE (rand2,rand)
            )`;
            const tblCreateInstance1 = await Parser.parse({ name: 'some_database', params: { inputDialect: 'postgres', dialect: 'mysql' } }, createTableSql, null, { log: false });
            const tblCreateInstance2 = CreateStatement.fromJSON(tblCreateInstance1.CONTEXT, tblCreateInstance1.toJSON());
            const sql1 = tblCreateInstance1 + '';
            const sql2 = tblCreateInstance2 + '';
            console.log(tblCreateInstance1, sql1);
            /*
            console.log(sql2);
            console.log(JSON.stringify(tblCreateInstance1.toJSON(), null, 3));
            console.log(JSON.stringify(tblCreateInstance2.toJSON(), null, 3));
            */
            expect(sql1).to.eq(sql2);
        });
    });

    describe(`Alter Table`, function() {

        it(`DO: Parses an Alter Table statement`, async function() {
            const alterTableSql = `
            ALTER TABLE public.test
                RENAME AS "new_tbl_n """"$ ame",
                SET SCHEMA "newDDDDD Dbbbbbb",
                RENAME constraint "constrai_""_nt_name1" TO "new_cons""traint_name",

                ADD constraint constraint_name2 PRIMARY KEY (col_name1),
                ADD constraint fruit_type UNIQUE (hhh),
                ADD PRIMARY KEY (col_name2),
                ADD CHECK (check_expr),

                ADD FULLTEXT INDEX (ft_name),

                MODIFY column new_col varchar(10) references distant_tbl (id) on update restrict on delete cascade FIRST,
                ADD column new_col2 int AFTER refColumn,

                DROP constraint if    exists constraint_name3 cascade,
                DROP PRIMARY KEY,
                DROP FOREIGN KEY "fk_ $ name",
                DROP COLUMN if exists col_name,
                DROP col_name,

                ALTER column "column _name" set data type varchar(60),
                ALTER CONSTRAINT constraint_name4 INVISIBLE,
                ALTER COLUMN column_name8 SET COMPRESSION compression_method,
                ALTER constraint constraint_name8 DEFERRABLE
            `;
            const tblAlterInstance1 = Parser.parse({ name: 'some_database', params: { inputDialect: 'postgres', dialect: 'mysql' } }, alterTableSql);
            const tblAlterInstance2 = AlterStatement.fromJSON(tblAlterInstance1.CONTEXT, tblAlterInstance1.toJSON());
            const sql1 = tblAlterInstance1 + '';
            const sql2 = tblAlterInstance2 + '';
            console.log(tblAlterInstance1, sql2);
            /*
            console.log(sql2);
            console.log(JSON.stringify(tblAlterInstance1.toJSON(), null, 3));
            console.log(JSON.stringify(tblAlterInstance2.toJSON(), null, 3));
            */
            expect(sql1).to.eq(sql2);
        });
        
        it(`DO: Diffs 2 schemas into an Alter Table statement`, async function() {
            const schema = {
                prefix: 'public',
                name: 'testt',
                $name: 'testtttt',
                columns: [
                    { name: 'id', $name: 'iddd', type: ['VARCHAR', 30], $type: 'int', default: 20, $default: 9, notNull: true },
                    { name: 'author', type: ['INT'], references: { name: 'fkk', targetTable: 'table1', targetColumns: ['col3', 'col4']}, keep: true },
                ],
                constraints: [
                    { type: 'FOREIGN_KEY', columns: ['id', 'author'], targetTable: 'testt', targetColumns: ['col5', 'author'] },
                    { type: 'PRIMARY_KEY', columns: 'col5', $columns: ['uuu', 'lll'], name: 'pk', $name: 'pk2' },
                ],
                indexes: []
            };
            const schemaInstance = TableSchema.fromJSON({}, schema);
            //schemaInstance.keep(true, 'auto');
            schemaInstance.column('author').drop();//.name('author2');
            //schemaInstance.reverseAlt(true);
            const tblAlterInstance1 = schemaInstance.getAlt();

            
            const tblAlterInstance2 = AlterStatement.fromJSON(tblAlterInstance1.CONTEXT, tblAlterInstance1.toJSON());
            const sql1 = tblAlterInstance1 + '';
            const sql2 = tblAlterInstance2 + '';
            console.log(sql1);
            /*
            console.log(sql2);
            console.log(JSON.stringify(schemaInstance.toJSON(), null, 3));
            console.log(JSON.stringify(tblAlterInstance1.toJSON(), null, 3));
            console.log(JSON.stringify(tblAlterInstance2.toJSON(), null, 3));
            */
            expect(sql1).to.eq(sql2);
        });
            
    });

});
