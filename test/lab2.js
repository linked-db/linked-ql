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

sql = `INSERT INTO users (email, parent_user ~> parent_user ~> metadata ~> data) VALUES ('dd', 3)`;







sql = `
INSERT INTO users
  (email, (parent_user <~ users) ~> (id, email))
DEFAULT VALUES`; // [✔]

sql = `
INSERT INTO users
  (email, (parent_user <~ users) ~> (id, email))
VALUES
  ('dd', ROW (50, 20)),
  ('dffff', ROW (5, 2000))`; // [✔]

sql = `
INSERT INTO users
  (email, (parent_user <~ users) ~> (id, email))
VALUES
  ROW ('rreeeee', (VALUES ROW (5, 60), ROW (5, 2000))),
  ROW ('dd', (SELECT 5, 1)),
  ROW ('dffff', (VALUES ROW (5, 10), ROW (5, 02))),
  ROW ('rreeeee', (VALUES ROW (5, 60), ROW (5, 2000)))
RETURNING id, email`; // [✔]

const resultNode = await registry['InsertStmt'].parse(sql);

sql = `
INSERT INTO users
  (id, email, (parent_user <~ users) ~> (id, email))
SELECT id, order_total, ROW(2, parent_order) FROM orders WHERE 1`;

sql = `
INSERT INTO users
  (id, email, (parent_user <~ users) ~> email)
SELECT id, order_total, parent_order FROM orders WHERE 1`;








sql = `
INSERT INTO users
  (email, parent_user ~> (id, email))
DEFAULT VALUES`; // [✔]

sql = `
INSERT INTO users
  (email, parent_user ~> (id, email))
VALUES
  ('dd', ROW (50, 20)),
  ('dffff', ROW (5, 2000))`; // [✔]

sql = `
INSERT INTO users
  (email, parent_user ~> (id, email))
VALUES
  ('dd', (501, 201)),
  ('dd', (502, 202)),
  ('dffff', (SELECT 5, 2000)),
  ('dd', (503, 203)),
  ('dd', (504, 204))`; // [✔]

sql = `
INSERT INTO users
  (id, email, parent_user ~> email)
SELECT id, order_total AS email, parent_order AS rr FROM orders as t WHERE 1`;

sql = `
INSERT INTO users
  (id, email, parent_user ~> (id, email))
SELECT id, order_total AS email, ROW(2, parent_order) AS rr FROM orders as t WHERE 1`;

//const resultNode = await registry['InsertStmt'].parse(sql);





sql = `
UPDATE users AS u
SET
  id = 2,
  email = 'x@x.com',
  (username, (parent_user <~ users) ~> id) = (232, 3445)
WHERE parent_user ~> id = 2`;

//const resultNode = await registry['UpdateStmt'].parse(sql);

//const resultNode = await registry['Expr'].parse('(parent_user <~ parent_user <~ users) ~> id');



//sql = `SELECT id, orders.parent_order, (SELECT email FROM users WHERE username = parent_order) FROM orders`;
//const resultNode = await registry['SelectStmt'].parse(sql);
//sql = `WITH t AS (SELECT * FROM orders) SELECT id, parent_order, (SELECT email FROM users WHERE username = parent_order) FROM t`;
//const resultNode = await registry['CTE'].parse(sql);



console.log('\n\n\n\nresultClassic:\n');
console.log(resultNode?.stringify());

console.log('\n\n\n\nresultClassicJson:\n');
console.log(resultNode?.jsonfy?.());

const { catalog } = await import('./01.catalog.parser.js');
const linkedDb = new LinkedDB({ catalog });

const cloneDeSugared = resultNode?.deSugar(4, { memoizeDimensionalInsertSelect: true }, null, linkedDb);
const resultDeSugared = cloneDeSugared?.stringify?.({ prettyPrint: true, autoLineBreakThreshold: 60/* default: 60 */ });

const cloneNode = resultNode?.constructor?.fromJSON(resultNode?.jsonfy?.(), resultNode?.options);
const resultPretty = cloneNode?.stringify?.({ prettyPrint: true, autoLineBreakThreshold: 6 });


console.log('\n\n\n\nresultDeSugared:\n');
console.log(resultDeSugared);

console.log('\n\n\n\nresultPretty:\n');
console.log(resultPretty);

console.log('\n\n\n\nresultSchema:\n');
console.log(cloneDeSugared?.resultSchema().entries().map((s) => s?.jsonfy()));
