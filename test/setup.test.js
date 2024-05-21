  
/**
 * @imports
 */
import { expect } from 'chai';
import { dbDriver, dbSchema as schema, dbData as data, Parser } from './install.js';
 
describe(`INSTALL QUERIES`, function() {
     
    var databases;
    before(`Create database "db1", drop-if-exists`, async function() {
        await dbDriver.dropDatabase('db1', {ifExists: true});
        databases = await dbDriver.createDatabase('db1');
    });

    it(`Ensure database "db1" exists`, async function() {
        var databases = await dbDriver.databases();
        expect(databases).to.be.an('array').that.deep.include({name: 'db1'});
    });

    it(`Create table/store "table1", add 3 rows and confirm: [1, 2, 3]`, async function() {
        var table1 = await databases.createTable('table1', schema.table1);
        expect(table1).to.respondTo('addAll');

        var addQuery = await table1.addAll(data.table1);
        expect(await addQuery.getAffectedRows(true)).to.be.an('array').that.eql([1, 2, 3]);
    });

    it(`Create table/store "table2", add 3 rows and confirm: [1, 2, 3]`, async function() {
        var table2 = await databases.createTable('table2', schema.table2);
        expect(table2).to.respondTo('addAll');

        var addQuery = await table2.addAll(data.table2);
        expect(await addQuery.getAffectedRows(true)).to.be.an('array').that.eql([1, 2, 3]);
    });

    it(`Create table/store "table3", add 3 rows and confirm: [1, 2, 3]`, async function() {
        var table3 = await databases.createTable('table3', schema.table3);
        expect(table3).to.respondTo('addAll');

        var addQuery = await table3.addAll(data.table3);
        expect(await addQuery.getAffectedRows(true)).to.be.an('array').that.eql([1, 2, 3]);
    });

    it(`Create table/store "table4"`, async function() {
        var table4 = await databases.createTable('table4', schema.table4);
        expect(table4).to.respondTo('addAll');
    });

});
