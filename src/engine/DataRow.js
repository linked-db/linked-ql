		
export default class DataRow {
	
	/**
	 * @constructor
	 */
	constructor(schema, data, mode = 'readwrite') {
		this._schema = schema;
		this._data = data;
		this._mode = mode;
		for (const col of schema.columns) {
			Object.defineProperty(this, col.name, {
				get: () => {
					return this._data[col.name];
				},
				set: value => {
					if (mode !== 'readwrite') throw new Error(`Cannot mutate data in readonly mode.`);
					this._data[col.name] = value;
				}
			});
		}
	}
}