import AbstractCursor from '../AbstractCursor.js';

export default class SQLCursor extends AbstractCursor {
	 
	constructor(store) {
		super([]);
		// ---------------
		this._store = store;
		// ---------------
		this._storeFetch = new Promise(async resolve => {
			this.cache = await this._store.select();
			resolve();
		});
	}
	 
	async fetch() {
		await this._storeFetch;
		return super.fetch();
	}
}
