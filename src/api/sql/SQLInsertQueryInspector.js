
import _isEmpty from '@webqit/util/js/isEmpty.js';
import _isArray from '@webqit/util/js/isArray.js';
import _isNumeric from '@webqit/util/js/isNumeric.js';
import _all from '@webqit/util/arr/all.js';
import AbstractInsertQueryInspector from '../abstracts/AbstractInsertQueryInspector.js';

export default class SQLInsertQueryInspector extends AbstractInsertQueryInspector {

    /**
     * Returns the query result info.
     * 
     * @return Object
     */
    info() {
        var infoArray;
        var match = (this.rawResultMeta.info || '').replace(/ /g, '').match(/Records:([0-9]*)Duplicates:([0-9]*)Warnings:([0-9]*)/);
        if (match) {
            infoArray = match.slice(1).map(n => parseInt(n));
        } else {
            infoArray = [0, 0, 0];
        }
        return {
            records: infoArray[0],
            duplicates: infoArray[1],
            warnings: infoArray[2],
        };
    }

    /**
     * Returns the affected rows for the query.
     * 
     * @param Bool withIDs
     * 
     * @return Array
     */
    async getAffectedRows(withIDs = false) {
        // Lets first attemp to inspect the entries themselves
        var pointers = this.getAffectedRowsPointers();
        // ---------------------
        // If IDs where explicitly assigned to each entry...
        if (pointers.by === 'primaryKey') {
            var primaryKeys = Object.keys(pointers.each[0]);
            if (primaryKeys.length === 1) {
                var affectedRows = pointers.each.map(entryPointer => entryPointer[primaryKeys[0]]);
                if (_all(affectedRows, id => _isNumeric(id))) {
                    if (!withIDs) {
                        return affectedRows.length;
                    }
                    return affectedRows.map(id => parseInt(id));
                }
            }
        }
        // ---------------------
        var primaryKey = 'id';
        // Here we query the databse with the pointers
        const where = pointerObj => {
            var pointerNames = Object.keys(pointerObj);
            var sql = pointerNames.reduce((sql, columnName) => sql.concat((
                _isArray(pointerObj[columnName]) ? `${columnName} IN ("${pointerObj[columnName].join('", "')}")` : `${columnName} = "${pointerObj[columnName]}"`)
            ), []).join(' AND ');
            return pointerNames.length > 1 ? `(${sql})` : sql;
        };
        // ---------------------
        var whereAll = '', whereEach = '';
        if (!_isEmpty(pointers.all)) {
            whereAll = where(pointers.all);
        }
        if (!_isEmpty(pointers.each)) {
            var pointerNames = Object.keys(pointers.each[0]);
            if (pointerNames.length === 1 && !_isArray(pointers.each[0][pointerNames[0]])) {
                whereEach = `${pointerNames[0]} IN (${pointers.each.map(pointerObj => pointerObj[pointerNames[0]]).join(', ')})`
            } else {
                whereEach = pointers.each.map(pointerObj => where(pointerObj)).join(' OR ');
            }
        }
        if (whereAll || whereEach) {
            var driver = this.table.database.client.params.driver;
            return new Promise((resolve, reject) => {
                var whereSql = whereAll && whereEach ? `${whereAll} AND (${whereEach})` : whereAll || whereEach;
                var query = `SELECT ${!withIDs ? `COUNT(*) AS count` : primaryKey} FROM ${this.table.name} WHERE ${whereSql} ORDER BY ${primaryKey} ASC`;
                driver.query(query, (err, result) => {
                    if (err) return reject(err);
                    if (!withIDs) {
                        return resolve(result[0].count);
                    }
                    resolve(result.map(row => row[primaryKey]));
                });
            });
        }
        // ---------------------
        if (this.rawResultMeta.insertId) {
            return !withIDs ? this.entries.length : this.entries.map(
                (entry, i) => this.rawResultMeta.insertId + 1
            );
        }
        return !withIDs ? 0 : [];
    }
}