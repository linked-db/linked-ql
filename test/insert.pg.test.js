import { expect } from 'chai';
import { Parser } from '../src/index.js';

describe(`INSERT QUERIES`, function() {

    var ast1, expr1 = `INSERT INTO table1 SET fname = "New name", age = 9000`;
    describe(`${expr1}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast1 = Parser.parse({ params: { dialect: 'mysql' } }, expr1);
        });

    });

    var ast2, expr2 = `INSERT IGNORE INTO table3 (fname, lname, age) VALUES ("Jakes", "Robertson", 1000), ("Jakes", "Robertson", 1000) ON DUPLICATE KEY UPDATE fname = "Updated name", age = 7000`;
    describe(`${expr2}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast2 = await Parser.parse({ params: { dialect: 'mysql' } }, expr2);
        });

    });

    var ast3, expr3 = `INSERT INTO table4 SELECT * FROM table3`;
    describe(`${expr3}`, function() {

        it(`"parse()" the expression and stringify to compare with original`, async function() {
            ast3 = await Parser.parse({}, expr3);
            expect(ast3.stringify({interpreted:false}).toLowerCase()).to.be.equal(expr3.toLowerCase());
        });

    });

});