import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Parser } from '../src/index.js';

chai.use(chaiAsPromised);

describe(`UPDATE QUERIES`, function() {

    var ast1, expr1 = `UPDATE table2 t2 set fname = 'New FNAME'`;
    describe(`${expr1}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast1 = await Parser.parse({}, expr1);
            expect(ast1.stringify().replace(/(\s+?\n\t|\s+?\n+)/g, ' ').toLowerCase()).to.be.equal(expr1.toLowerCase());
        });

    });

    var ast2, expr2 = `UPDATE table2 t2, table3 t3 set t2.lname = 100, t3.lname = 500 WHERE t2.age = 20 AND t3.age = 10`;
    describe(`${expr2}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast2 = await Parser.parse({}, expr2);
            expect(ast2.stringify().toLowerCase().replace(/(\s?\n\t|\s+?\n)/g, ' ')).to.be.equal(expr2.toLowerCase());
        });

    });

    var ast3, expr3 = `UPDATE (select id, ffnn, aaggee aaagggeee from (select id, fname ffnn, age aaggee from table2) ta) tb set ffnn = 'ddddddddddddd', aaagggeee = 900 WHERE aaagggeee = 22`;
    describe(`${expr3}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast3 = await Parser.parse({}, expr3);
            expect(ast3.stringify().toLowerCase().replace(/(\s?\n\t|\s+?\n)/g, ' ')).to.be.equal(expr3.toLowerCase());
        });

    });

    var ast4, expr4 = `UPDATE (select id, ffnn, aaggee aaagggeee from (select id, SUM(fname) ffnn, age aaggee from table2) ta) tb set ffnn = 'ddddddddddddd', aaagggeee = 900 WHERE aaagggeee = 900`;
    describe(`${expr4}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast4 = await Parser.parse({}, expr4);
            expect(ast4.stringify().toLowerCase().replace(/(\s?\n\t|\s+?\n)/g, ' ')).to.be.equal(expr4.toLowerCase());
        });

    });

});