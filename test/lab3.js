import '../src/lang/index.js';
import { registry } from '../src/lang/registry.js';
import { DBContext } from '../src/lang/DBContext.js';

let sql, resultNode;

sql = `SELECT * FROM users`;
resultNode = await registry['BasicSelectStmt'].parse(sql);

console.log('\n\n\n\nresultClassic:\n');
console.log(resultNode?.stringify());

console.log('\n\n\n\nresultClassicJson:\n');
const { catalog } = await import('./01.catalog.parser.js');
const dbContext = new DBContext({ catalog });
console.log(resultNode?.clone?.({ deSugar: 2 }, null, dbContext).stringify({ prettyPrint: true }));

process.emit();
