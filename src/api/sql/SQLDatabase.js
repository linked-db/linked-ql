import AbstractDatabase from '../AbstractDatabase.js';
import SQLTable from './SQLTable.js';

export default class SQLDatabase extends AbstractDatabase {
	
    /**
	 * SQLTable class.
     * 
     * @property Object
	 */
    static Table = SQLTable;

    /**
     * Returns a list of tables.

     * 
     * @return Array
	 */
    async tables() {
        return await this.tablesCallback(async () => {
            const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = '${ this.name }'`;
            const result = await this.client.driver.query(sql);
            return (result.rows || result).map(row => row.table_name);
        });
    }
}