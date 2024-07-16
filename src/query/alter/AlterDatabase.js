
import Lexer from '../Lexer.js';
import AbstractStatementNode from './abstracts/AbstractStatementNode.js';
import Action from './Action.js';

export default class AlterDatabase extends AbstractStatementNode {

	/**
	 * Adds a "OWNER TO" action to the instance.
	 * 
	 * @param String newOwner
	 * 
	 * @returns Action
	 */
	addOwner(newOwner) { return this.build('ACTIONS', [newOwner], Action, 'owner'); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		if (!this.ACTIONS.length) return '';
		let stmts = [], rename0, move0;
		for (const action of this.ACTIONS) {
			// RENAME TO...
			if (action.TYPE === 'RENAME') {
				rename0 = `RENAME TO ${ this.autoEsc(action.ARGUMENT) }`;
				continue;
			}
			// MOVE TO...
			if (action.TYPE === 'MOVE') {
				move0 = `SET TABLESPACE ${ this.autoEsc(action.ARGUMENT) }`;
				continue;
			}
			// DROP
			if (action.TYPE === 'DROP') {
				// All flags are postgres'
				const ifExists = action.hasFlag('IF_EXISTS');
				const restrictOrCascadeFlag = action.getFlag('RESTRICT') || action.getFlag('CASCADE');
				stmts.push(`DROP TABLE${ ifExists ? ' IF EXISTS' : '' } ${ this.autoEsc([].concat(action.ARGUMENT.name)).join('.') }${ restrictOrCascadeFlag ? ` ${ restrictOrCascadeFlag }` : '' }`);
				continue;
			}
			// ADD
			if (action.TYPE === 'NEW') {
				stmts.push(action.ARGUMENT+'');
				continue;
			}
			// ALTER
			if (action.TYPE === 'ALTER') {
				const { REFERENCE: reference, ARGUMENT: subAction } = action;
				stmts.push(subAction.ARGUMENT+'');
			}
		}
		const sql = [ ...stmts ];
		if (rename0) sql.push(`ALTER SCHEMA ${ this.autoEsc(this.NAME) }\n\t${ rename0 }`);
		if (move0) sql.push(`ALTER SCHEMA ${ this.autoEsc(rename0 ? this.ACTIONS.find(action => action.TYPE === 'RENAME').ARGUMENT : this.NAME) }\n\t${ move0 }`);
		return sql.join(';\n');
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, rest ] = /^ALTER\s+DATABASE\s+([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const [ namePart, bodyPart ] = Lexer.split(rest, ['\\s+'], { useRegex: true, limit: 1 });
		const [ dbName ] = this.parseIdent(context, namePart.trim(), true) || [];
		if (!dbName) return;
		const instance = (new this(context)).name(dbName);
		// ----------
		const regex = name => new RegExp(`${ this[ name ].source }`, 'i');
		// RENAME ... TO ...
		const [ renameMatch, newNodeNameUnescaped_a, /*esc*/, newNodeNameEscaped_a ] = regex('renameRe').exec(bodyPart) || [];
		if (renameMatch) {
			const newNodeName = newNodeNameUnescaped_a || this.autoUnesc(instance, newNodeNameEscaped_a);
			instance.addRename(newNodeName);
			return instance;
		}
		// MOVE ... TO ...
		const [ moveMatch, newSchemaUnescaped, /*esc*/, newSchemaEscaped ] = regex('moveRe').exec(bodyPart) || [];
		if (moveMatch) {
			instance.addMove(newSchemaUnescaped || this.autoUnesc(instance, newSchemaEscaped));
			return instance;
		}
		// OWNER ... TO ...
		const [ ownerMatch, newOwnerUnescaped, /*esc*/, newOwnerEscaped ] = regex('ownerRe').exec(bodyPart) || [];
		if (ownerMatch) {
			instance.addOwner(newOwnerUnescaped || this.autoUnesc(instance, newOwnerEscaped));
			return instance;
		}
		return instance;
	}

    /**
	 * @property RegExp
	 */
	static renameRe = /^RENAME\s+TO\s+(?:(\w+)|([`"])((?:\2\2|[^\2])+)\2)$/;
	static moveRe = /^SET\s+TABLESPACE\s+(?:(\w+)|([`"])((?:\2\2|[^\2])+)\2)$/;
	static ownerRe = /^OWNER\s+TO\s+(?:(\w+)|([`"])((?:\2\2|[^\2])+)\2)$/;

}