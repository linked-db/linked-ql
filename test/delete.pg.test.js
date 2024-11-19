 
/**
 * @imports
 */
import { expect } from 'chai';
import { Parser } from '../src/index.js';

describe(`DELETE QUERIES`, function() {

    var ast1, expr1 = `DELETE FROM t1 USING table1 t1 WHERE t1.age < 60`;
    describe(`${expr1}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast1 = await Parser.parse({}, expr1);
            expect(ast1.stringify().toLowerCase()).to.be.equal(expr1.toLowerCase());
        });

    });

});
