

export default class AbstractCursor {
	 
	_pos = 0;
	_eof = false;
	_onfinish = [];

	/**
	 * @constructor
	 */
	constructor(rows) {
		this._cache = rows;
	}
		 
	/**
	 * @inheritdoc
	 */
	get eof() { return !this._cache.length || this._pos === this._cache.length - 1; }
	 
	/**
	 * @inheritdoc
	 */
	onfinish(callback) { this._onfinish.push(callback); }
	 
	/**
	 * @inheritdoc
	 */
	next() {
		if (this.eof) {
			this._onfinish.forEach(callback => callback());
			this._pos = 0;
			return;
		}
        this._pos ++;
	}
	 
	/**
	 * @inheritdoc
	 */
	async fetch() {
		if (this.eof) return;
		return this._cache[this._pos];
	}
}