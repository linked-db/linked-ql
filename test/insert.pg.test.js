  
/**
 * @imports
 */
import { expect } from 'chai';
import Parser from '../src/query/Parser.js';

describe(`INSERT QUERIES`, function() {

    before('Import into DB', async function() {
        return;
        await dbDriver.dropDatabase('db1', {ifExists: true});
        await dbDriver.importDatabase('db1', { schema, data });
    });

    var ast1, expr1 = `INSERT INTO table1 SET fname = "New name", age = 9000`;
    describe(`${expr1}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast1 = await Parser.parse({}, expr1);
            //expect(ast1.stringify({interpreted:false}).toLowerCase()).to.be.equal(expr1.toLowerCase());
        });return;

        it(`"eval()" the expression and expect affected rows to be: { table1: [4] }`, async function() {
            var result = await ast1.eval(dbDriver);
            expect(result).to.be.an('object').that.have.keys('table1');
            expect(await result.table1.getAffectedRows(true)).to.be.an('array').that.eql([4]);
        });

    });

    var ast2, expr2 = `INSERT IGNORE INTO table3 (fname, lname, age) VALUES ("Jakes", "Robertson", 1000), ("Jakes", "Robertson", 1000) ON DUPLICATE KEY UPDATE fname = "Updated name", age = 7000`;
    describe(`${expr2}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast2 = await Parser.parse({}, expr2);
            //expect(ast2.stringify({interpreted:false}).toLowerCase()).to.be.equal(expr2.toLowerCase());
        });return;

        it(`"eval()" the expression and expect affected rows to be: { table3: [4] }. (See embedded comments for explanation.)`, async function() {
            var result = await ast2.eval(dbDriver);
            expect(result).to.be.an('object').that.have.keys('table3');
            // First insertion at "4",
            // second insertion fails on duplicate key,
            // then an update at "4"
            expect(await result.table3.getAffectedRows(true)).to.be.an('array').that.eql([4]);
        });

    });

    var ast3, expr3 = `INSERT INTO table4 SELECT * FROM table3`;
    describe(`${expr3}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast3 = await Parser.parse({}, expr3);
            //expect(ast3.stringify({interpreted:false}).toLowerCase()).to.be.equal(expr3.toLowerCase());
        });return;

        it(`"eval()" the expression and expect affected rows to be: { table4: [1, 2, 3, 4] }`, async function() {
            var result = await ast3.eval(dbDriver);
            expect(result).to.be.an('object').that.have.keys('table4');
            expect(await result.table4.getAffectedRows(true)).to.be.an('array').that.eql([ 1, 2, 3, 4 ]);
        });

    });

});