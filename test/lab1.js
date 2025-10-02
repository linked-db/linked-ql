import { TokenStream } from '../src/lang/TokenStream.js';

const sql = 'my_app@\'^2_1\' my_lib@\'~7_6\'';

const tokenStream = await TokenStream.create(sql, { structured: true });

for await (const tok of tokenStream) {
    console.log(tok);
}

let r = {ff: 4};
r[Symbol.for('dd')] = 44;
console.log(r, Object.keys(r))