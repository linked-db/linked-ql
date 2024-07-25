
import Lexer from '../../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import AbstractStatement from '../AbstractStatement.js';
import Identifier from '../../componets/Identifier.js';
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
	NAME;
	ACTIONS = [];
	SUBTREE = [];

	get length() { return this.ACTIONS.length + this.SUBTREE.length; }

	/**
	 * @inheritdoc
	 */
	action(...actions) {
		if (!arguments.length) return this.ACTIONS[this.ACTIONS.length - 1];
		return (this.build('ACTIONS', actions, this.constructor.NODE_TYPES), this);
	}

	/**
	 * @inheritdoc
	 */
	create(kind, argument) { return this.action({ clause: 'CREATE', kind, argument }); }

	/**
	 * @inheritdoc
	 */
	rename(kind, name, argument) { return this.action({ clause: 'RENAME', kind, name, argument }); }

	/**
	 * @inheritdoc
	 */
	modify(kind, argument) { return this.action({ clause: 'MODIFY', kind, argument }); }

	/**
	 * @inheritdoc
	 */
	change(kind, name, argument) { return this.action({ clause: 'CHANGE', kind, name, argument }); }

	/**
	 * @inheritdoc
	 */
	alter(kind, name, argument) { return this.action({ clause: 'ALTER', kind, name, argument }); }

	/**
	 * @inheritdoc
	 */
	add(kind, argument) { return this.action({ clause: 'ADD', kind, argument }); }

	/**
	 * @inheritdoc
	 */
	drop(kind, name) { return this.action({ clause: 'DROP', kind, name }); }

	/**
	 * @inheritdoc
	 */
	set(kind, argument) { return this.action({ clause: 'SET', kind, argument }); }

	/**
	 * @inheritdoc
	 */
	toJson() {
        return {
            name: this.NAME.toJson(),
            actions: this.ACTIONS.map(x => x.toJson()),
			...super.toJson(),
        };
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!json?.kind || !json.name || !Array.isArray(json.actions)) return;
        const instance = super.fromJson(context, json)?.name(json.name);
		instance.action(...json.actions);
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
		if (!this.length) return '';
		const resolveName = name => {
			if (name.BASENAME || ['SCHEMA','DATABASE'].includes(this.KIND)) return name;
			const basename = this.$trace('get:name:database');
			return name.clone().name([basename,name.NAME]);
		};
		const [ stmts, renames, ownRename, ownMove ] = this.ACTIONS.reduce(([a, b, c, d, ], action) => {
			if (action instanceof Rename) return action.KIND ? [a, b.concat(action), c, d] : [a, b, action, d];
			if (action instanceof Set && action.KIND === 'SCHEMA') return [a, b, c, action];
			return [a.concat(action), b, c, d];
		}, [[], [], ]);
		const baseStmt = name => `${ this.CLAUSE } ${ this.KIND }${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ name }`;
		const sql = [...this.SUBTREE];
		const name = resolveName(this.name());
		if (stmts.length) sql.push(`${ baseStmt(name) }\n\t${ stmts.join(',\n\t') }`);
		for (const stmt of renames.concat(ownRename || [])) sql.push(`${ baseStmt(name) } ${ stmt }`);
		if (ownMove) sql.push(`${ baseStmt(ownRename && resolveName(Identifier.fromJson(this, ownRename.ARGUMENT)) || name) } ${ ownMove }`);
		return sql.join(';\n');
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, kind, ifExists, rest ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s).join('|') })\\s+(?:(IF\\s+EXISTS)\\s+)?([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		const [ namePart, bodyPart ] = Lexer.split(rest, ['\\s+'], { useRegex: true, limit: 1 });
		instance.name(parseCallback(instance, namePart, [Identifier]));
		instance.action(...Lexer.split(bodyPart, [',']).map(s => parseCallback(instance, s, this.NODE_TYPES)));
		if (ifExists) instance.withFlag('IF_EXISTS');
		return instance;
	}

	static get CLAUSE() { return 'ALTER'; }
	static NODE_TYPES = [Rename,Alter,Change,Modify,Add,Drop,Set];
    static KINDS = ['TABLE', 'SCHEMA', 'DATABASE'];
}