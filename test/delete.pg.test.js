 
/**
 * @imports
 */
import { expect } from 'chai';
import Parser from '../src/query/Parser.js';

describe(`DELETE QUERIES`, function() {

    before('Import into DB', async function() {
        return;
        await dbDriver.dropDatabase('db1', {ifExists: true});
        await dbDriver.importDatabase('db1', { schema, data });
    });

    var ast1, expr1 = `DELETE FROM t1 USING table1 t1 WHERE t1.age < 60`;
    describe(`${expr1}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast1 = await Parser.parse({}, expr1);
            expect(ast1.stringify().toLowerCase()).to.be.equal(expr1.toLowerCase());
        });return;

        it(`"eval()" the expression and expect affected rows to be: { t1: [ [1], [2] ] }`, async function() {
            var result = await ast1.eval(dbDriver);
            expect(result).to.be.an('object').that.have.keys('t1');
            expect(await result.t1.getAffectedRows()).to.be.a('number').that.eql(2);
        });

    });

});
