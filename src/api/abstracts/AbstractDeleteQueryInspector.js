
export default class AbstractDeleteQueryInspector {

    /**
     * Accepts the insert payload
     * 
     * @param AbstractTable table
     * @param Object rawResultMeta
     * @param Object whereObj
     */
    constructor(table, rawResultMeta, whereObj) {
        this.table = table;
        this.rawResultMeta = rawResultMeta;
        this.whereObj = whereObj;
    }
}