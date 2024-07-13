
import Node from '../../abstracts/Node.js';
import StatementNode from '../../abstracts/StatementNode.js';
import Action from '../Action.js';

export default class AbstractStatementNode extends StatementNode {
	
	static Node = Node;
	
	/**
	 * Instance properties
	 */
	NAME;
	BASENAME;

	/**
	 * @var Array
	 */
	ACTIONS = [];

	/**
	 * Returns name or sets name.
	 * 
	 * @param Void|String name
	 * 
	 * @returns String
	 */
	name(name) {
		if (!arguments.length) return this.NAME;
		return (this.NAME = name, this);
	}

	/**
	 * Returns basename or sets basename.
	 * 
	 * @param Void|String name
	 * 
	 * @returns String
	 */
	basename(basename) {
		if (!arguments.length) return this.BASENAME;
		return (this.BASENAME = basename, this);
	}

	/**
	 * Adds a "RENAME" action to the instance.
	 * 
	 * @param String newName
	 * 
	 * @returns Action
	 */
	addRename(newName) { return this.build('ACTIONS', [newName], Action, 'rename'); }

	/**
	 * Adds a "MOVE" action to the instance.
	 * 
	 * @param String newName
	 * 
	 * @returns Action
	 */
	addMove(newDb) { return this.build('ACTIONS', [newDb], Action, 'move'); }

	/**
	 * Adds a "DROP" action to the instance.
	 * 
	 * @param Object argument
	 * 
	 * @returns Action
	 */
	addDrop(argument) { return this.build('ACTIONS', [argument], Action, 'drop'); }

	/**
	 * Adds a "ADD" action to the instance.
	 * 
	 * @param Object argument
	 * 
	 * @returns this
	 */
	addNew(argument) { return this.build('ACTIONS', [argument], Action, 'new'); }

	/**
	 * Adds a "ALTER" action to the instance.
	 * 
	 * @param Object reference
	 * @param Any argument
	 * 
	 * @returns Action
	 */
	addAlt(reference, argument) { return this.build('ACTIONS', [reference, argument], Action, 'alter'); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			name: this.NAME,
			...(this.BASENAME ? { basename: this.BASENAME } : {}),
			actions: this.ACTIONS.map(action => action.toJson()),
			...(this.FLAGS.length ? { flags: this.FLAGS } : {}),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string' || !Array.isArray(json.actions)) return;
		const instance = (new this(context))
			.name(json.name)
			.basename(json.basename)
			.withFlag(...(json.flags || []));
		for (const action of json.actions) {
			instance.ACTIONS.push(Action.fromJson(instance, action));
		}
		return instance;
	}
}