import DataRow2D from './DataRow2D.js';

export default class AbstractCursor2D {

    _eof = false;
    _onfinish = [];

    /**
	 * @constructor
	 */
    constructor(tables, where = []) {
		this.tables = tables;
		this.where = where;
		this.cursors = this.tables.map(t => t.table.getCursor());
        this.cursors.slice(0).reverse().reduce((prevCursor, currentCursor) => {
            if (prevCursor) { prevCursor.onfinish(currentCursor.next.bind(currentCursor)); }
            return currentCursor;
        }, null).onfinish(() => {
            this._eof = true;
            this._onfinish.forEach(callback => callback());
        });
        this.aliases = this.tables.map(t => t.alias || t.table.name);
        this.joinTypes = this.tables.map(t => (t.joinType || '').toUpperCase());
    }

    /**
     * @property Bool
     */
    get eof() { return this._eof; }
	 
	/**
	 * @inheritdoc
	 */
	onfinish(callback) { this._onfinish.push(callback); }

    /**
	 * @inheritdoc
	 */
    next() { this.cursors[this.cursors.length - 1].next(); }

	/**
	 * Executes a fetch operation spanning tables and conditions.
     * 
     * @returns Row
	 */
	async fetch() {
		if (this.eof) return;
		let dataRow2DRejection;
        const dataRow2D = new DataRow2D(this.aliases);
		await Promise.all(this.cursors.map(async (cursor, i) => {
            if (dataRow2DRejection) return;
            const dataRow = await cursor.fetch();
            if (!this.joinTypes[i] || this.joinTypes[i] === 'FULL') {
                dataRow2D[this.aliases[i]] = dataRow;
            } else if (this.tables[i].conditionClause.trim().toUpperCase() === 'USING') {
                // Join using "column name"...
                const column = this.tables[i].condition.stringify();
                if (dataRow[column] === dataRow[column]) {
                    dataRow2D[this.aliases[i]] = dataRow;
                }
            } else {
                dataRow2D[this.aliases[i]] = dataRow;
                if (!this.tables[i].condition.eval(dataRow2D)) {
                    dataRow2D[this.aliases[i]] = undefined;
                }						
            }
            // ---------------------
            // Left/Right Join 
            // ---------------------
            if (!dataRow2D[this.aliases[i]]) {
                if (cursor.eof && this.joinTypes[i] === 'LEFT') {
                    dataRow2D[this.aliases[i]] = {};
                } else if (this.cursors[0].eof && this.joinTypes[i] === 'RIGHT') {
                    dataRow2D[this.aliases[0]] = {};
                    dataRow2D[this.aliases[i]] = undefined;
                } else {
                    dataRow2DRejection = true;
                }
            }
		}));
		if (Object.keys(dataRow2D).find(k => !dataRow2D[k])) {
            dataRow2DRejection = true;
        }
		// ----------
		// Apply where
		// ----------
		try {
			if (!dataRow2D || (this.where && !this.where.eval(dataRow2D))) {
                this.next();
                return await this.fetch();
            }
		} catch(e) { throw new Error(`["${ this.where.stringify() }" in WHERE clause]: ${ e.message }`); }
		return dataRow2D;
	}
}