import { SQLTable } from './SQLTable.js';
import { AbstractDatabase } from '../AbstractDatabase.js';

export class SQLDatabase extends AbstractDatabase {

    static Table = SQLTable;
}