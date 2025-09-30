import '../src/lang/index.js';
import { registry } from '../src/lang/registry.js';
import { SchemaInference } from '../src/lang/SchemaInference.js';

let sql, resultNode;

sql = `b IS NULL OR a > b`;
resultNode = await registry['Expr'].parse(sql);
console.log(resultNode.jsonfy());

process.emit();

console.log('\n\n\n\nresultClassic:\n');
console.log(resultNode?.stringify());

console.log('\n\n\n\nresultClassicJson:\n');
const { catalog } = await import('./01.catalog.parser.js');
const schemaInference = new SchemaInference({ catalog });

const deSugared = resultNode?.clone?.({ deSugar: true }, null, schemaInference);
console.log(deSugared.stringify({ prettyPrint: true }));

console.log(JSON.stringify(deSugared.clone({ resultSchemas: false, originSchemas: false }), null, 3), '\n\n\n');
//console.log(JSON.stringify(deSugared.originSchemas?.(), null, 3), '\n\n\n');
console.log(deSugared.resultSchema?.());

process.emit();
