import { TokenStream } from '../src/TokenStream.js';

// regexes, dollar string, keywords
async function* sampleInput() {
    yield "SELECT *, 2- +3 FROM users WHERE cond1::DOUBLE PRECISION IS /*block comment in betwwen operator*/ NOT TRUE OR cond2 NOT BETWEEN W AND 3 AND cond3 IS NOT DISTINCT FROM e AND name345 = E'John' AND color = 30e-1 AND age > '0xfff' AND address = -{";
    yield "  'street': 'Main St', suite: \\:var_name, 'city': 'New York'\\:\\:text, zipcode: /*some comment*";
    yield "/10.001 } ORDER BY name |-.4 DESC $e2$-nn$kk$nn-$e2$-'dd\\\\\\'";
    yield "'ee';";
}


//process.exit();
(async () => {
    const tokenStream = await TokenStream.create(sampleInput(), { mysqlAnsiQuotes: false, dia_lect: 'mysql', structured: true, spaces: true });

    let block;
    for await (const token of tokenStream) {
        console.log(token);
        if (token?.type.endsWith('_block')) {
            block = token;
            continue;
        }
    }
    console.log('Block:', block?.type);
    for await (const subToken of (block?.value || [])) {
        console.log(subToken);
    }
    console.log('Block end');
})();
