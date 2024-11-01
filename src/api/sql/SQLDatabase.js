import { SQLTable } from './SQLTable.js';
import { AbstractDatabase } from '../AbstractDatabase.js';

export class SQLDatabase extends AbstractDatabase {
	
    /**
	 * SQLTable class.
     * 
     * @property Object
	 */
    static Table = SQLTable;
}