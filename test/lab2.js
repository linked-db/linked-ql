import '../src/lang/index.js';
import { registry } from '../src/lang/registry.js';
import { LinkedDB } from '../src/db/LinkedDB.js';

let sql;

sql = `SELECT email, p ~> username, m FROM (SELECT parent_user ~> email, parent_user ~> parent_user AS p, parent_user ~> parent_user ~> metadata ~> data AS m[], { "id" []: id+2 } from users)`;
sql = `SELECT email, ((users) parent_user <~ parent_user <~ users).metadata ~> id AS m[] FROM users u`;
sql = `SELECT a, c FROM (VALUES (1, 2, '3')) t(a, b, c)`;
sql = `SELECT * FROM call_expr() WITH ORDINALITY t (x, y)`;
sql = `SELECT * FROM call_expr() AS (x VARCHAR, y TEXT)`;
sql = `SELECT * FROM call_expr() AS t (x VARCHAR, y TEXT)`;
sql = `SELECT * FROM ROWS FROM (call_expr1() AS (x VARCHAR, y TEXT), call_expr2(), call_expr3() AS (z JSON)) WITH ORDINALITY`;
sql = `SELECT d, r, t FROM (SELECT { id, data }, ((user_metadata) metadata <~ parent_user <~ parent_user <~ users) ~> email AS m[] FROM user_metadata) AS SS (d, r, t)`;

sql = `
WITH SS (d, r, t) AS (SELECT { id, data }, ((user_metadata) metadata <~ parent_user <~ parent_user <~ users) ~> email AS m[] FROM user_metadata)
  SELECT d, r, t FROM SS`;
sql = `
WITH SS AS (SELECT * FROM call_expr() AS t (x VARCHAR, y TEXT))
  SELECT * FROM SS`;
sql = `
WITH t (a, b, c) AS (VALUES (1, 2, '3'))
  SELECT {a, c} FROM t`;

sql = `INSERT INTO users (email, parent_user ~> parent_user ~> metadata ~> data) VALUES ('dd', 3);`
sql = `INSERT INTO users (email, parent_user ~> id) VALUES ('dd', 3), ('dffff', 5);`
sql = `INSERT INTO users (email, (parent_user <~ users) ~> id) VALUES ('dd', 3), ('dffff', 5) RETURNING id, email;`

const resultNode = await registry['InsertStmt'].parse(sql);


console.log('\n\n\n\nresultClassic:\n');
console.log(resultNode?.stringify());

console.log('\n\n\n\nresultClassicJson:\n');
console.log(resultNode?.jsonfy?.());

const { catalog } = await import('./01.catalog.parser.js');
const linkedDb = new LinkedDB({ catalog });

const cloneDeSugared = resultNode?.deSugar(4, {}, null, linkedDb);
const resultDeSugared = cloneDeSugared?.stringify?.({ prettyPrint: true, autoLineBreakThreshold: 60/* default: 60 */ });

const cloneNode = resultNode?.constructor?.fromJSON(resultNode?.jsonfy?.(), resultNode?.options);
const resultPretty = cloneNode?.stringify?.({ prettyPrint: true, autoLineBreakThreshold: 6 });


console.log('\n\n\n\nresultDeSugared:\n');
console.log(resultDeSugared);

console.log('\n\n\n\nresultPretty:\n');
console.log(resultPretty);

console.log('\n\n\n\nresultSchema:\n');
console.log(cloneDeSugared?.resultSchema().entries().map((s) => s?.jsonfy()));
