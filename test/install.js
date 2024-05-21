 
/**
 * @imports
 */
import Parser from '../src/Parser.js';
import ODB from '../src/databases/odb/ODBDriver.js';
import SQL from '../src/databases/sql/SQLDriver.js';

export { Parser };

const SqlClient = await import(this.sqlClient);
var driver = SqlClient.createConnection({
	host: this.params.host,
	user: this.params.user,
	password: this.params.password,
});
this.driver = new Promise((resolve, reject) => {
	driver.connect(err => {
		if (err) return reject(err);
	});
});

/*
export const dbDriver = new ODB;
*/
export const dbDriver = new SQL('mysql2', {
	host: '127.0.0.1',
	user: 'root',
	password: '3926',
});

export const dbSchema = {
	table1: {
		name: 'table1',
		primaryKey: 'id',
		columns: {id: {type: 'int', autoIncrement: true}, parent: {}, fname:{}, lname:{default:'Default Lname1'}, age:{type: 'int', default:0}, time1:{type: 'timestamp', onupdate: 'CURRENT_TIMESTAMP'}, time2:{type: 'datetime', default: 'CURRENT_TIMESTAMP'}},
		indexes: {age: {keyPath: 'age', type: 'unique'}},
	},
	table2: {
		name: 'table2',
		primaryKey: 'id',
		columns: {id: {type: 'int', autoIncrement: true}, fname:{}, lname:{default:'Default Lname2'}, age:{type: 'int', default:0}, tablename:{default: 't2'}, parent:{
			referencedEntity: {table: 'table2', column: 'id'}
		}, time1:{type: 'timestamp', onupdate: 'CURRENT_TIMESTAMP'}, time2:{type: 'datetime', default: 'CURRENT_TIMESTAMP'}},
		indexes: {age: {keyPath: 'age', type: 'unique'}},
	},
	table3: {
		name: 'table3',
		primaryKey: 'id',
		columns: {id: {type: 'int', autoIncrement: true}, parent: {type: 'int'}, fname:{}, lname:{default:'Default Lname3'}, age:{type: 'int', default:0}, tablename:{default: 't3'}, time1:{type: 'timestamp', onupdate: 'CURRENT_TIMESTAMP'}, time2:{type: 'datetime', default: 'CURRENT_TIMESTAMP'}},
		indexes: {age: {keyPath: 'age', type: 'unique'}},
	},
	table4: {
		name: 'table4',
		primaryKey: 'id',
		columns: {id: {type: 'int', autoIncrement: true}, parent: {}, fname:{}, lname:{default:'Default Lname4'}, age:{type: 'int', default:0}, tablename:{default: 't4'}, time1:{type: 'timestamp', onupdate: 'CURRENT_TIMESTAMP'}, time2:{type: 'datetime', default: 'CURRENT_TIMESTAMP'}},
		indexes: {age: {keyPath: 'age', type: 'unique'}},
	},
};
export const dbData = {
	table1: [
		{fname: 'John', lname: 'Doe', age: 33},
		{fname: 'James', lname: 'Smith', age: 40},
		{fname: 'Tim', lname: 'Cook', age: 60},
	],
	table2: [
		{fname: 'John2', lname: 'Doe2', age: 22, parent: null},
		{fname: 'James2', lname: 'Smith2', age: 20, parent: 1},
		{fname: 'Tim2', lname: 'Cook2', age: 30, parent: 2},
	],
	table3: [
		{fname: 'John3', lname: 'Doe3', age: 11},
		{fname: 'James3', lname: 'Smith3', age: 10},
		{fname: 'Tim3', lname: 'Cook3', age: 15},
	],
	table4: [],
};