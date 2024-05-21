
import ODB from './databases/odb/ODBClient.js';
import IDB from './databases/idb/IDBClient.js';
import SQL from './databases/sql/SQLClient.js';

// As globals
if (!self.webqit) { self.webqit = {}; }
self.webqit.ObjectiveSQL = {
	ODB,
	IDB,
	SQL
};
