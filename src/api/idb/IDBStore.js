
import _isArray from '@webqit/util/js/isArray.js';
import _isNumeric from '@webqit/util/js/isNumeric.js';
import _arrFrom from '@webqit/util/arr/from.js';
import DuplicateKeyViolationError from '../DuplicateKeyViolationError.js';
import AbstractTable from '../AbstractTable.js';
import IDBCursor from './IDBCursor.js';
import IDBProgressiveCursor from './IDBProgressiveCursor.js';

/**
 * ---------------------------
 * IDBStore class
 * ---------------------------
 */				

export default class IDBStore extends AbstractTable {
	
    /**
     * @inheritdoc
     */
    constructor(database, tableName, $api, params = {}) {
        super(database, tableName, params);
        this.$api = $api;
    }

	/**
	 * Returns a cursor.
	 * 
	 * @return IDBCursor
	 */
	getCursor() { return new IDBCursor(this.$api.getStore()); }

	/**
	 * Returns a cursor.
	 * 
	 * @return IDBProgressiveCursor
	 */
	getProgressiveCursor() { return new IDBProgressiveCursor(this.$api.getStore()); }
	 
	/**
	 * @inheritdoc
	 */
	getAll() {
		return new Promise(async (resolve, reject) => {
			const getAllRequest = (this.tx_store || this.$api.getStore('readonly')).getAll();
			getAllRequest.onsuccess = e => resolve(_arrFrom(e.target.result));
			getAllRequest.onerror = e => reject(e.target.error);
		});
	}
	 
	/**
	 * @inheritdoc
	 */
	get(primaryKey) {
		return new Promise(async (resolve, reject) => {
			// Now this is very important
			primaryKey = _isNumeric(primaryKey) ? parseInt(primaryKey) : primaryKey;
			const getRequest = (this.tx_store || this.$api.getStore('readonly')).get(primaryKey);
			getRequest.onsuccess = e => resolve(e.target.result);
			getRequest.onerror = e => reject(e.target.error);
		});
	}
	
	/**
	 * @inheritdoc
	 */
	count(...query) {
		return new Promise(async (resolve, reject) => {
			const countRequest = this.$api.getStore().count(...query);
			countRequest.onsuccess = e => resolve(e.target.result);
			countRequest.onerror = e => reject(e.target.error);
		});
	}
	
	/**
	 * @inheritdoc
	 */
	addAll(multiValues, columns = [], duplicateKeyCallback = null) {
		this.tx_store = this.$api.getStore();
		return super.addAll(...arguments);
	}

	/**
	 * @inheritdoc
	 */
	add(rowObj) {
		return new Promise(async (resolve, reject) => {
			const addRequest = (this.tx_store || this.$api.getStore()).add(rowObj);
			addRequest.onsuccess = e => resolve(e.target.result);
			addRequest.onerror = e => {
				const error = e.target.error;
				if (error.name === 'ConstraintError') {
					reject(new DuplicateKeyViolationError(error.message));
				} else {
					reject(error);
				}
			};
		});
	}
	
	/**
	 * @inheritdoc
	 */
	putAll(rowObj) {
		this.tx_store = this.$api.getStore();
		return super.putAll(...arguments);
	}

	/**
	 * @inheritdoc
	 */
	put(rowObj) {
		return new Promise(async (resolve, reject) => {
			const putRequest = (this.tx_store || this.$api.getStore()).put(rowObj);
			putRequest.onsuccess = e => resolve(e.target.result);
			putRequest.onerror = e => reject(e.target.error);
		});
	}
	
	/**
	 * @inheritdoc
	 */
	deleteAll(primaryKey) {
		this.tx_store = this.$api.getStore();
		return super.deleteAll(...arguments);
	}

	/**
	 * @inheritdoc
	 */
	delete(primaryKey) {
		if (_isArray(primaryKey)) {
			if (primaryKey.length > 1) { throw new Error('IDB does not support Composite Primary Keys'); }
			primaryKey = primaryKey[0];
		}
		// Now this is very important
		primaryKey = _isNumeric(primaryKey) ? parseInt(primaryKey) : primaryKey;
		return new Promise(async (resolve, reject) => {
			const delRequest = (this.tx_store || this.$api.getStore()).delete(primaryKey);
			delRequest.onsuccess = e => resolve(primaryKey);
			delRequest.onerror = e => reject(e.target.error);
		});
	}
}