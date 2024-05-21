
/**
 * ---------------------------
 * IDBProgressiveCursor class
 * ---------------------------
 */				

export default class IDBProgressiveCursor {
	 
	/**
	 * @inheritdoc
	 */
	constructor(store) {
		// ---------------
		this._store = store;
		// ---------------
		this.cache = [];
		this.key = 0;
		this._onfinish = [];
		this.flags = {};
	}
	 
	/**
	 * @inheritdoc
	 */
	onfinish(callback) {this._onfinish.push(callback);}
	 
	/**
	 * @inheritdoc
	 */
	next() {
		if (!this._eof) {
			if (!this._cursorRequest) {
				throw new Error('fetch() must be called before calling next()');
			}
			this.key ++;
		} else {
			if (!this.cache.length || this.key === this.cache.length - 1) {
				this._onfinish.forEach(callback => callback());
				this.key = 0;
				return;
			}
			this.key ++;
		}
	}
		 
	/**
	 * @inheritdoc
	 */
	eof() {
		// The store must reach eof before we can be correct with this.cache.length
		return this._eof && (!this.cache.length || this.key === this.cache.length - 1);
	}
	 
	/**
	 * @inheritdoc
	 */
	async fetch() {
		var store = await this._store;
		return new Promise(resolve => {
			// After having filled this.cache from store
			if (this._eof || this.key < this.cache.length) {
				resolve(this.cache[this.key]);
			} else {
				if (!this._countRequest) {
					// First time reading from store
					this._countRequest = store.count();
					this._countRequest.onsuccess = e => {
						this._count = e.target.result;
						this._cursorRequest = store.openCursor();
						this._handleCursorFetch(resolve);
						this._continueCursor = () => this._cursor.continue();
					};
				} else {
					this._handleCursorFetch(resolve);
					this._continueCursor();
				}
			}
		});
	}

	/**
	 * Helps handle cursor result
	 * 
	 * @param Function resolve
	 * 
	 * @return void
	 */
	_handleCursorFetch(resolve) {
		this._cursorRequest.onsuccess = e => {
			this._cursor = e.target.result;
			if (this._cursor) {
				var value = this._cursor.value;
				this.cache.push(value);
				if (this.cache.length === this._count) {
					this._eof = true;
				}
				resolve(value);
			} else {
				this._eof = true;
				resolve();
			}
		}
	}
}
