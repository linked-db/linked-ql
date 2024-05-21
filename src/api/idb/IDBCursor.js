
import _arrFrom from '@webqit/util/arr/from.js';
import AbstractCursor from '../AbstractCursor.js';


/**
 * ---------------------------
 * IDBCursor class
 * ---------------------------
 */				

export default class IDBCursor extends AbstractCursor {
	 
	/**
	 * @inheritdoc
	 */
	constructor(store) {
		super([]);
		// ---------------
		this._store = store;
		// ---------------
		this._storeFetch = new Promise(async resolve => {
			var store = await this._store;
			var getAllRequest = store.getAll();
			getAllRequest.onsuccess = e => {
				this.cache = _arrFrom(e.target.result);
				resolve();
			};
		});
	}
	 
	/**
	 * @inheritdoc
	 */
	async fetch() {
		await this._storeFetch;
		return super.fetch();
	}
}