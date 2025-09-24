import '../src/lang/index.js';
import { registry } from '../src/lang/registry.js';
import { DBContext } from '../src/lang/DBContext.js';

let sql, resultNode;

sql = `SELECT email AS alias[], (SELECT * FROM users u2 WHERE u1.id = u2.id) u FROM users u1`;
resultNode = await registry['BasicSelectStmt'].parse(sql);

console.log('\n\n\n\nresultClassic:\n');
console.log(resultNode?.stringify());

console.log('\n\n\n\nresultClassicJson:\n');
const { catalog } = await import('./01.catalog.parser.js');
const dbContext = new DBContext({ catalog });

const deSugared = resultNode?.clone?.({ deSugar: true }, null, dbContext);
console.log(deSugared.stringify({ prettyPrint: true }));

console.log(JSON.stringify(deSugared.clone({ resultSchemas: false, originSchemas: false }), null, 3), '\n\n\n');
//console.log(JSON.stringify(deSugared.originSchemas?.(), null, 3), '\n\n\n');
console.log(deSugared.resultSchema?.());

process.emit();
