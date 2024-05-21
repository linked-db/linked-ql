
import AbstractDeleteQueryInspector from '../abstracts/AbstractDeleteQueryInspector.js';

/**
 * ---------------------
 * The SQLDeleteQueryInspector class
 * ---------------------
 */
export default class SQLDeleteQueryInspector extends AbstractDeleteQueryInspector {

    /**
     * Returns the affected rows for the query.
     * 
     * @param Bool withIDs
     * 
     * @return Array
     */
    async getAffectedRows(withIDs = false) {
        if (withIDs) { throw new Error(`The "withIDs" argument is not supported for delete queries.`) }
        return this.rawResultMeta.affectedRows;
    }
}