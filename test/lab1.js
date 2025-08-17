import { TokenStream } from '../src/lang/TokenStream.js';

const sql = `DEFAULT VALUES`;

const tokenStream = await TokenStream.create(sql, { structured: true });

for await (const tok of tokenStream) {
    console.log(tok);
}