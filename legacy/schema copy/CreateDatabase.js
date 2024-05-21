
/**
 * @imports
 */
import CreateInterface from './CreateInterface.js';

/**
 * ---------------------------
 * CreateDatabase class
 * ---------------------------
 */				

export default class CreateDatabase extends CreateInterface {
	 
	/**
	 * @inheritdoc
	 */
	constructor(name, params = {}) {
		super();
		this.name = name;
		this.params = params;
	}
	
	/**
	 * @inheritdoc
	 */
	async eval() {}

	/**
	 * @inheritdoc
	 */
	toJson() { return { name: this.name }; }
	
	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify(params = {}) { return `CREATE SCHEMA${ this.params.ifNotExists ? ' IF NOT EXISTS' : '' } ${ this.name }`; }

	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		const [ , ifNotExists, dbName ] = /CREATE[ ]+DATABASE[ ]+(IF[ ]+NOT[ ]+EXISTS[ ]+)?(\w+)/i.exec(expr) || [];
		if (!dbName) return;
		if (ifNotExists) { params = { ...params, ifNotExists: true }; }
		return new this(dbName, params);
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (!json.name || !json.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain database name or database name invalid.`);
		return new this(json.name, params);
	}

	/**
	 * @inheritdoc
	 */
	static cloneSchema(json) {
		const jsonClone = { name: json.name };
		const rebase = (obj, key) => {
			const value = obj[key];
			Object.defineProperty(obj, `$${ key }`, { get: () => value });
		};
		rebase(jsonClone, 'name');
		return jsonClone;
	}
}