
import StatementNode from '../abstracts/StatementNode.js';

export default class CreateDatabase extends StatementNode {
	 
    /**
	 * Instance properties
	 */
	NAME = '';

	/**
	 * @constructor
	 */
	constructor(context, name) {
		super(context);
		this.NAME = name;
	}

	/**
	 * Sets the name
	 * 
	 * @param String name
	 * 
	 * @returns Void
	 */
	name(name) { this.NAME = name; }

	/**
	 * @inheritdoc
	 */
	toJson() { return { name: this.NAME, flags: this.FLAGS }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string') return;
		return (new this(context, json.name)).withFlag(...(json.flags || []));
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `CREATE SCHEMA${ this.hasFlag('IF_NOT_EXISTS') ? ' IF NOT EXISTS' : '' } ${ this.autoEsc(this.NAME) }`; }

	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, ifNotExists, namePart ] = /^CREATE\s+DATABASE\s+(IF\s+NOT\s+EXISTS\s+)?(.+)$/i.exec(expr) || [];
		if (!match) return;
		const [name] = this.parseIdent(context, namePart.trim(), true) || [];
		if (!name) return;
		const instance = new this(context, name, params);
		if (ifNotExists) instance.withFlag('IF_NOT_EXISTS');
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	static cloneJson(json) {
		const jsonClone = { name: json.name };
		const rebase = (obj, key) => {
			const value = obj[key];
			Object.defineProperty(obj, `$${ key }`, { get: () => value });
		};
		rebase(jsonClone, 'name');
		return jsonClone;
	}
}