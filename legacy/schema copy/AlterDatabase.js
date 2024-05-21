
/**
 * @imports
 */
import AlterInterface from './AlterInterface.js';

/**
 * ---------------------------
 * AlterDatabase class
 * ---------------------------
 */				

export default class AlterDatabase extends AlterInterface {
	 
	/**
	 * @inheritdoc
	 */
	constructor(target, actions, params = {}) {
		super();
		this.target = target;
		this.actions = actions;
		this.params = params;
	}
	
	/**
	 * @inheritdoc
	 */
	async eval() {}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			target: this.target,
			actions: this.actions.map(action => structuredClone(action)),
		};
	}
	
	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const newDbName = this.actions.find(action => action.type === 'RENAME')?.argument;
		if (!newDbName) return '';
		return `ALTER SCHEMA${ this.params.ifExists ? ' IF EXISTS' : '' } ${ this.target.name } RENAME TO ${ newDbName }`;
	}

	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		const [ , ifExists, dbName, newName ] = /ALTER[ ]+DATABASE[ ]+(IF[ ]+EXISTS[ ]+)?(\w+)[ ]+RENAME[ ]+TO[ ]+(\w+)/i.exec(expr) || [];
		if (!dbName) return;
		const actions = [{ type: 'RENAME', argument: newName }];
		if (ifExists) { params = { ...params, ifExists: true }; };
		return new this({ name: dbName }, actions, params);
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (!json.target.name || !json.target.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain database name or database name invalid.`);
		const actions = json.actions.map(action => structuredClone(action));
		return new this(json.target, actions, params);
	}
	
	/**
	 * @inheritdoc
	 */
	static fromDiffing(jsonA, jsonB, params = {}) {
		if (!jsonA.name || !jsonA.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain database1 name or database1 name invalid.`);
		if (!jsonB.name || !jsonB.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain database2 name or database2 name invalid.`);
		const actions = [];
		if (jsonB.name !== jsonA.name) {
			actions.push({
				type: 'RENAME',
				argument: jsonB.name,
			})
		}
		return new this(jsonA, actions, params);
	}

}