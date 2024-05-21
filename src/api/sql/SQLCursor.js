
import AbstractCursor from '../abstracts/AbstractCursor.js';

export default class SQLCursor extends AbstractCursor {
	 
	/**
	 * @inheritdoc
	 */
	constructor(store) {
		super([]);
		// ---------------
		this._store = store;
		// ---------------
		this._storeFetch = new Promise(async resolve => {
			this.cache = await this._store.getAll();
			resolve();
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
