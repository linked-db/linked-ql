
import StatementNode from '../abstracts/StatementNode.js';

export default class DropTable extends StatementNode {
	
	/**
	 * Instance properties
	 */
	NAME = '';
	BASENAME = '';

	/**
	 * @constructor
	 */
	constructor(context, name, basename) {
		super(context);
		this.NAME = name;
		this.BASENAME = basename;
	}

	/**
	 * Sets the name
	 * 
	 * @param Array|String name
	 * 
	 * @returns Void
	 */
	name(name) {
		const nameParts = Array.isArray(name) ? [...name] : [name];
		this.NAME = nameParts.pop();
		this.BASENAME = nameParts.pop();
		if (nameParts.length) throw new Error(`Idents can be maximum of two parts. Recieved: ${ nameParts.reverse().join('.') }.${ this.BASENAME }.${ this.NAME }`);
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
		return (new this(context, json.name, json.basename)).withFlag(...(json.flags || []));
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `DROP TABLE${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc([this.BASENAME, this.NAME].filter(s => s)).join('.') }${ this.hasFlag('CASCADE') ? ' CASCADE' : '' }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, ifExists, namePart ] = /^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(expr) || [];
		if (!match) return;
		const [tblName, dbName] = this.parseIdent(context, namePart.trim(), true) || [];
		if (!tblName) return;
		const instance = new this(context, tblName, dbName);
		if (ifExists) instance.withFlag('IF_EXISTS');
		return instance;
	}

}