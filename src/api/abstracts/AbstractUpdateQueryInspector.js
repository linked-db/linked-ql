
import _all from '@webqit/util/arr/all.js';
import _any from '@webqit/util/arr/any.js';
import _unique from '@webqit/util/arr/unique.js';
import _isArray from '@webqit/util/js/isArray.js';

export default class AbstractUpdateQueryInspector {

    /**
     * Accepts the insert payload
     * 
     * @param AbstractTable table
     * @param Object rawResultMeta
     * @param Array columns
     * @param Array entries
     * @param Object duplicateKeyUpdateObj
     */
    constructor(table, rawResultMeta, columns, entries, duplicateKeyUpdateObj = {}) {
        this.table = table;
        this.rawResultMeta = rawResultMeta;
        this.columns = columns;
        this.entries = entries;
        this.duplicateKeyUpdateObj = duplicateKeyUpdateObj;
    }

	/**
	 * Returns the pointers for the inserts.
     * 
     * @return Object
	 */
    async getAffectedRowsPointers() {
        if (!_isArray(this.columns) || !_isArray(this.entries)) {
            return;
        }
		var keyPaths = [], wheres = { all: {}, each: [], };
		var primaryKeyColumns = await this.table.primaryKeyColumns();
		if (_any(primaryKeyColumns, columnName => this.columns.includes(columnName))) {
			keyPaths = [primaryKeyColumns];
			wheres.by = 'primaryKey';
		} else {
			var uniqueColumns = this.table.columnsForConstraint('UNIQUE');
			keyPaths = uniqueColumns.filter(keyPath => _any(keyPath, columnName => this.columns.includes(columnName)));
			wheres.by = 'uniqueKeys';
		}
		if (keyPaths.length) {
			// -------------
            var columnIndexes = {};
            _unique(keyPaths.reduce((all, keyPath) => all.concat(keyPath), [])).forEach(columnName => {
                var columnNameIndexInRows = this.columns.indexOf(columnName);
                if (columnNameIndexInRows === -1) {
                    // Use default value
                    wheres.all[columnName] = this.table.def.schema.columns[columnName].default;
                } else {
                    columnIndexes[columnName] = columnNameIndexInRows;
                }
            });
            var columnIndexNames = Object.keys(columnIndexes);
            if (columnIndexNames.length) {
                this.entries.forEach(entry => {
                    var where = {};
                    columnIndexNames.forEach(columnName => {
                        if (_isArray(entry)) {
                            where[columnName] = entry[columnIndexes[columnName]];
                        } else {
                            where[columnName] = entry[columnName];
                        }
                        if (this.duplicateKeyUpdateObj && (columnName in this.duplicateKeyUpdateObj)) {
                            where[columnName] = [where[columnName], this.duplicateKeyUpdateObj[columnName]];
                        }
                    });
                    wheres.each.push(where);
                });
            }
			// -------------
		}
        return wheres;
	}
}