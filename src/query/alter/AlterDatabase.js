
import StatementNode from '../abstracts/StatementNode.js';
import Action from './Action.js';

export default class AlterDatabase extends StatementNode {
	 
	/**
	 * Instance properties
	 */
	NAME = '';
	ACTIONS = [];

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
	 * Adds a "RENAME" action to the instance,
	 * 
	 * @param String newName
	 * 
	 * @returns Action
	 */
	renameTo(newName) { return this.build('ACTIONS', [newName], Action, 'renameTo'); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			name: this.NAME,
			actions: this.ACTIONS.map(action => action.toJson()),
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string') return;
		const instance = (new this(context, json.name)).withFlag(...(json.flags || []));
		for (const action of json.actions) {
			instance.ACTIONS.push(Action.fromJson(context, action));
		}
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const newDbName = this.ACTIONS.find(action => action.TYPE === 'RENAME' && !action.REFERENCE)?.ARGUMENT;
		if (!newDbName) return '';
		return `ALTER SCHEMA${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc(this.NAME) } RENAME TO ${ this.autoEsc(newDbName) }`;
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, ifExists, rest ] = /^ALTER\s+DATABASE\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(expr) || [];
		if (!match) return;
		const [ name1Part, name2Part ] = Lexer.split(rest, ['RENAME\s+TO'], { useRegex: 'i' });
		const [name1] = this.parseIdent(context, name1Part.trim(), true) || [];
		const [name2] = this.parseIdent(context, name2Part.trim(), true) || [];
		if (!name1 || !name2) return;
		const instance = new this(context, name1);
		if (ifExists) instance.withFlag('IF_EXISTS');
		return instance.renameTo(name2);
	}
	
	/**
	 * @inheritdoc
	 */
	static fromDiffing(context, jsonA, jsonB, flags = []) {
		if (!jsonA.name) throw new Error(`Could not assertain database1 name or database1 name invalid.`);
		if (!jsonB.name) throw new Error(`Could not assertain database2 name or database2 name invalid.`);
		const instance = (new this(context, jsonA.name)).withFlag(...flags);
		// RENAME TO...
		if (jsonB.name !== jsonA.name) {
			instance.renameTo(jsonB.name);
		}
		return instance;
	}

}