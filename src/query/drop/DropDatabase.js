
import StatementNode from '../abstracts/StatementNode.js';

export default class DropDatabase extends StatementNode {
	 
	/**
	 * Instance properties
	 */
	NAME;

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
	 * @inheritdoc
	 */
	toJson() { return { name: this.NAME, flags: this.FLAGS }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string') return;
		return (new this(context)).name(json.name).withFlag(...(json.flags || []));;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `DROP SCHEMA${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc(this.NAME) }${ this.hasFlag('CASCADE') ? ' CASCADE' : '' }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, ifExists, namePart, cascade, namePartAlt ] = /^DROP\s+DATABASE\s+(IF\s+EXISTS\s+)?(?:(.+)\s+(CASCADE)$|(.+)$)/i.exec(expr.trim()) || [];
		if (!match) return;
		const [dbName] = this.parseIdent(context, (namePart || namePartAlt).trim(), true) || [];
		if (!dbName) return;
		const instance = (new this(context)).name(dbName);
		if (ifExists) instance.withFlag('IF_EXISTS');
		if (cascade) instance.withFlag('CASCADE');
		return instance;
	}

}