import { SQLClient } from './api/sql/SQLClient.js';

// As globals
if (!self.linkedDB) { self.linkedDB = {}; }
self.linkedDB.LinkedQL = {
	SQLClient
};
