
import Identifier from '../../components/Identifier.js';
import AbstractStatement from '../AbstractStatement.js';
import AbstractNode from '../AbstractNode.js';

export default class DropStatement extends AbstractStatement(AbstractNode) {

	/**
	 * @inheritdoc
	 */
	toJson() { return { name: this.NAME.toJson(), ...super.toJson(), }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!json.name) return;
        return super.fromJson(context, json)?.name(json.name);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const restrictOrCascade = this.params.dialect !== 'mysql' && (this.getFlag('RESTRICT') || this.getFlag('CASCADE'));
		const resolveName = name => {
			if (name.BASENAME || ['SCHEMA','DATABASE'].includes(this.KIND)) return name;
			const basename = this.$trace('get:name:database');
			return name.clone().name([basename,name.NAME]);
		};
		const name = resolveName(this.name());
		return `${ this.CLAUSE }${ this.getFlag('TEMPORARY') ? ' TEMPORARY' : '' } ${ this.KIND }${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ name }${ restrictOrCascade ? ` ${ restrictOrCascade }` : '' }`;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		// mysql|postgres: DROP TABLE [IF EXISTS] ... [RESTRICT | CASCADE]
		// postgres: DROP DATABASE [IF EXISTS] ... [FORCE] || DROP SCHEMA [IF EXISTS] ... [RESTRICT | CASCADE]
		// mysql: DROP {DATABASE | SCHEMA} [IF EXISTS] ... || DROP [TEMPORARY] TABLE ... [IF EXISTS] ... [RESTRICT | CASCADE]
		const [ match, temporaryTable, kind, ifExists, name, restrictOrCascade ] = (new RegExp(`^${ this.CLAUSE }\\s+(TEMPORARY\\s+)?(${ this.KINDS.map(s => s).join('|') })\\s+(?:(IF\\s+EXISTS)\\s+)?([\\s\\S]+?)(?:\\s+(RESTRICT|CASCADE|FORCE))?$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		instance.name(parseCallback(instance, name, [Identifier]));
		if (temporaryTable) instance.withFlag('TEMPORARY');
		if (ifExists) instance.withFlag('IF_EXISTS');
		if (restrictOrCascade) instance.withFlag(restrictOrCascade);
		return instance;
	}

	static get CLAUSE() { return 'DROP'; }
    static KINDS = ['TABLE', 'SCHEMA', 'DATABASE'];
}