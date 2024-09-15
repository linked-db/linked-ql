import Lexer from '../../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import AbstractStatement from '../AbstractStatement.js';
import Identifier from '../../components/Identifier.js';
import Rename from '../rename/Rename.js';
import Add from '../create/Add.js';
import Drop from '../drop/Drop.js';
import Set from './Set.js';
import Alter from './Alter.js';
import Change from './Change.js';
import Modify from './Modify.js';

export default class AlterStatement extends AbstractStatement(AbstractNode) {

	/**
	 * Instance props.
	 */
	IDENT;
	ACTIONS = [];
	SUBTREE = [];

	get length() { return this.ACTIONS.length + this.SUBTREE.length; }

	ident(value) {
		if (!arguments.length) return this.IDENT;
		return (this.build('IDENT', [value], Identifier), this);
	}

	action(...actions) {
		if (!arguments.length) return this.ACTIONS[this.ACTIONS.length - 1];
		return (this.build('ACTIONS', actions, this.constructor.NODE_TYPES), this);
	}

	create(kind, argument) { return this.action({ clause: 'CREATE', kind, argument }); }

	rename(kind, ident, argument) { return this.action({ clause: 'RENAME', kind, ident, argument }); }

	modify(kind, argument) { return this.action({ clause: 'MODIFY', kind, argument }); }

	change(kind, ident, argument) { return this.action({ clause: 'CHANGE', kind, ident, argument }); }

	alter(kind, ident, argument) { return this.action({ clause: 'ALTER', kind, ident, argument }); }

	add(kind, argument) { return this.action({ clause: 'ADD', kind, argument }); }

	drop(kind, ident) { return this.action({ clause: 'DROP', kind, ident }); }

	set(kind, argument) { return this.action({ clause: 'SET', kind, argument }); }

	toJSON() {
		return {
			ident: this.IDENT.toJSON(),
            actions: this.ACTIONS.map(x => x.toJSON()),
			...super.toJSON(),
		};
	}

	static fromJSON(context, json) {
		if (!json?.kind || !Array.isArray(json.actions) || !Identifier.fromJSON(context, json?.ident)) return;
		const instance = super.fromJSON(context, json);
		instance?.ident(json.ident).action(...json.actions);
		return instance;
	}

	stringify() {
		if (!this.length) return '';
		const resolveIdent = ident => {
			if (ident.prefix() || ['SCHEMA','DATABASE'].includes(this.KIND)) return ident;
			return ident.clone().prefix(this.$trace('get:DATABASE_NAME'));
		};
		const [ stmts, renames, ownRename, ownMove ] = this.ACTIONS.reduce(([a, b, c, d, ], action) => {
			if (action instanceof Rename) return action.KIND ? [a, b.concat(action), c, d] : [a, b, action, d];
			if (action instanceof Set && action.KIND === 'SCHEMA') return [a, b, c, action];
			return [a.concat(action), b, c, d];
		}, [[], [], ]);
		const writeBaseStmt = ident => `${ this.CLAUSE } ${ this.KIND }${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ ident }`;
		const sql = [...this.SUBTREE];
		const ident = resolveIdent(this.ident());
		if (stmts.length) sql.push(`${ writeBaseStmt(ident) }\n\t${ stmts.join(',\n\t') }`);
		for (const stmt of renames.concat(ownRename || [])) sql.push(`${ writeBaseStmt(ident) } ${ stmt }`);
		if (ownMove) sql.push(`${ writeBaseStmt(ownRename && resolveIdent(ownRename.ARGUMENT) || ident) } ${ ownMove }`);
		return sql.join(';\n');
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, kind, $expr ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s).join('|') })\\s+([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		const [ ident, $$expr ] = Lexer.split($expr, ['\\s+'], { useRegex: 'i', limit: 1 });
		instance.ident(parseCallback(instance, ident, [Identifier]));
		instance.action(...Lexer.split($$expr, [',']).map(s => parseCallback(instance, s, this.NODE_TYPES)));
		return instance;
	}

	static get CLAUSE() { return 'ALTER'; }
	static NODE_TYPES = [Rename,Alter,Change,Modify,Add,Drop,Set];
    static KINDS = ['TABLE', 'SCHEMA', 'DATABASE'];
}