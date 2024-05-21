
/**
 * @imports
 */
import DropInterface from './DropInterface.js';

/**
 * ---------------------------
 * DropDatabase class
 * ---------------------------
 */				

export default class DropDatabase extends DropInterface {
	 
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
	stringify() { return `DROP SCHEMA${ this.params.ifExists ? ' IF EXISTS' : '' } ${ this.name }${ this.params.cascade ? ' CASCADE' : '' }`; }
	
	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		const [ , ifExists, dbName ] = /DROP[ ]+DATABASE[ ]+(IF[ ]+EXISTS[ ]+)?(\w+)/i.exec(expr) || [];
		if (!dbName) return;
		if (ifExists) { params = { ...params, ifExists: true }; }
		return new this(dbName, params);
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (!json.name || !json.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain database name or database name invalid.`);
		return new this(json.name, params);
	}

}