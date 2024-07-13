
import StatementNode from '../abstracts/StatementNode.js';

export default class DropTable extends StatementNode {
	
	/**
	 * Instance properties
	 */
	NAME;
	BASENAME;

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
	 * @inheritdoc
	 */
	toJson() { return { name: this.NAME, basename: this.BASENAME, flags: this.FLAGS }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string') return;
		return (new this(context)).name(json.name).basename(json.basename).withFlag(...(json.flags || []));
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `DROP TABLE${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc([this.BASENAME, this.NAME].filter(s => s)).join('.') }${ this.hasFlag('CASCADE') ? ' CASCADE' : '' }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, ifExists, namePart, cascade, namePartAlt ] = /^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(?:(.+)\s+(CASCADE)$|(.+)$)/i.exec(expr) || [];
		if (!match) return;
		const [tblName, dbName] = this.parseIdent(context, (namePart || namePartAlt).trim(), true) || [];
		if (!tblName) return;
		const instance = (new this(context)).name(tblName).basename(dbName);
		if (ifExists) instance.withFlag('IF_EXISTS');
		if (cascade) instance.withFlag('CASCADE');
		return instance;
	}

}