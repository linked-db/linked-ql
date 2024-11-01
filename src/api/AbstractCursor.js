

export class AbstractCursor {
	 
	_pos = 0;
	_eof = false;
	_onfinish = [];

	/**
	 * @constructor
	 */
	constructor(rows) {
		this._cache = rows;
	}
		 
	get eof() { return !this._cache.length || this._pos === this._cache.length - 1; }
	 
	onfinish(callback) { this._onfinish.push(callback); }
	 
	next() {
		if (this.eof) {
			this._onfinish.forEach(callback => callback());
			this._pos = 0;
			return;
		}
        this._pos ++;
	}
	 
	async fetch() {
		if (this.eof) return;
		return this._cache[this._pos];
	}
}