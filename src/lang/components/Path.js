
import Lexer from '../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import Identifier from './Identifier.js';
import JsonPath from './json/JsonPath.js';

export default class Path extends AbstractNode {

	/**
	 * Static properties
	 */
	static ARR_RIGHT = '~>';
 	static ARR_LEFT = '<~';

	/**
	 * Instance propeties
	 */
	OPERATOR = '';
	LHS = null;
	RHS = null;
	UUID = null;

	/**
	 * @property Bool
	 */
	get isOutgoing() { return this.OPERATOR === this.constructor.ARR_RIGHT; }

	/**
	 * @property Bool
	 */
	get isIncoming() { return this.OPERATOR === this.constructor.ARR_LEFT; }

	/**
	 * @property String
	 */
	get uuid() {
		if (!this.UUID) { this.UUID = `$path:${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }`; }
		return this.UUID;
	}

	/**
	 * Builds the operands.
	 * 
	 * @param Identifier lhs 
	 * @param String operator
	 * @param Identifier,Path rhs 
	 * 
	 * @returns Void
	 */
	path(lhs, operator, rhs) {
		const $static = this.constructor;
		if (![$static.ARR_LEFT, $static.ARR_RIGHT].includes(operator)) throw new Error(`Unknown operator: "${ operator }".`);
		this.build('LHS', [lhs], Identifier);
		this.build('RHS', [rhs], [$static,JsonPath,Identifier]);
		this.OPERATOR = operator;
	}

	/**
	 * Evaluates the relationship 
	 * and returns the parameters for plotting the join.
	 * 
	 * @returns Object
	 */
	async eval() {
		const clientApi = this.$trace('get:api:client');
		const stmtNode = this.$trace('get:node:statement')
		if (!clientApi) throw new Error(`No client API in context.`);
		const getPrimaryKey = schema => schema.primaryKey()?.columns()[0];
		const getTargetTable = async (schema, foreignKey) => {
			const targetTable = schema.foreignKeys().find(fk => fk.columns().includes(foreignKey.NAME))?.targetTable();
			if (targetTable && !targetTable.PREFIX) return Identifier.fromJSON(this, [await clientApi.resolveName(targetTable.NAME),targetTable.NAME]);
			return targetTable;
		};
		if (this.isIncoming) {
			if (!(this.RHS instanceof Path)) throw new Error(`Unterminated path: ${ this.RHS }`);
			// --------------------------
			// === {foreignKey}LHS<-RHS{table...}
			let foreignKey_rhs, table_rhs, schema_rhs, path;
			if (this.RHS.isIncoming) {
				if (!(this.RHS.RHS instanceof Path)) throw new Error(`Unterminated path: ${ this.RHS.RHS }`);
				// === {foreignKey}LHS<-RHS{foreignKey_rhs<-table->?...}
				({ LHS: foreignKey_rhs/*Identifier*/, RHS/*Path*/: path } = this);
				({ schema: schema_rhs, table: table_rhs } = (await path.eval()).lhs);
			} else {
				// === {foreignKey}LHS<-RHS{table->path}
				({ LHS: foreignKey_rhs/*Identifier*/, RHS/*Path*/: { LHS: table_rhs/*Identifier*/, RHS: path/*Identifier|Path*/ } } = this);
				if (!table_rhs.PREFIX) { table_rhs = Identifier.fromJSON(this, [await clientApi.resolveName(table_rhs.NAME), table_rhs.NAME]); }
				schema_rhs = await stmtNode.$schema(table_rhs.PREFIX, table_rhs.NAME);
				if (!schema_rhs) throw new Error(`[${ this }]: The implied table ${ table_rhs } does not exist.`);
			}
			const table_lhs = await getTargetTable(schema_rhs, foreignKey_rhs);
			// Validate that schema_rhs has the implied foreign key (actingKey)
			if (!table_lhs) throw new Error(`[${ this }]: Table ${ table_rhs } does not define the implied foreign key: ${ foreignKey_rhs }.`);
			// -------------
			// Get schema_lhs from keyDef
			const schema_lhs = await stmtNode.$schema(table_lhs.PREFIX, table_lhs.NAME);
			if (!schema_lhs) throw new Error(`[${ this }]: The implied table ${ table_lhs } does not exist.`);
			// Get shcema_lhs's acting key (primary key) and validate
			const primaryKey_lhs = getPrimaryKey(schema_lhs);
			if (!primaryKey_lhs) throw new Error(`[${ this }]: Table ${ schema_lhs } does not define a primary key.`);
			// -------------
			// Put together
			return {
				lhs: { table: table_lhs, schema: schema_lhs, primaryKey: primaryKey_lhs, },
				rhs: { table: table_rhs, schema: schema_rhs, foreignKey: foreignKey_rhs, path, },
			};
		}
		// -------------
		// reference === {foreignKey}LHS->RHS{path}
		const table_lhs = await baseTableIdent.call(this);
		if (!table_lhs) throw new Error(`No tables in query.`);
		// Get lhs schema
		const schema_lhs = await stmtNode.$schema(table_lhs.PREFIX, table_lhs.NAME);
		if (!schema_lhs) throw new Error(`[${ this }]: The implied table ${ table_lhs } does not exist.`);
		const { LHS: foreignKey_lhs/*Identifier*/, RHS: path/*Identifier|Path*/ } = this;
		// We get schema2 from schema_lhs
		const table_rhs = await getTargetTable(schema_lhs, foreignKey_lhs);
		// Validate that schema_lhs has the implied foreign key (foreignKey)
		if (!table_rhs) throw new Error(`[${ this }]: Table ${ table_lhs } does not define the implied foreign key: ${ foreignKey_lhs }.`);
		// -------------
		// Get schema_rhs from keyDef!
		const schema_rhs = await stmtNode.$schema(table_rhs.PREFIX, table_rhs.NAME);
		if (!schema_rhs) throw new Error(`[${ this }]: The implied table ${ table_rhs } does not exist.`);
		// Get shcema_lhs's acting key (primary key) and validate
		const primaryKey_rhs = getPrimaryKey(schema_rhs);
		if (!primaryKey_rhs) throw new Error(`[${ this }]: Table ${ table_rhs } does not define a primary key.`);
		// -------------
		// Put together
		return {
			lhs: { table: table_lhs, schema: schema_lhs, foreignKey: foreignKey_lhs, },
			rhs: { table: table_rhs, schema: schema_rhs, primaryKey: primaryKey_rhs, path, },
		};
	}

	/**
	 * Plots the relationship.
	 * 
	 * @returns Void
	 */
	async plot() {
		if (this.JOINT) return;
		const stmtNode = this.$trace('get:node:statement');
		// Resolve relation and validate
		const baseTable = await baseTableIdent.call(this);
		if (!baseTable) throw new Error(`No tables in query.`);
		// Do plotting
		const { lhs, rhs } = await this.eval();
		const baseKey = lhs.foreignKey?.NAME || lhs.primaryKey;
		const joinKey = rhs.primaryKey || rhs.foreignKey.NAME;
		if (lhs.primaryKey/*then incoming reference*/ && (lhs.table.NAME.toLowerCase() !== baseTable.NAME.toLowerCase() || lhs.table.PREFIX.toLowerCase() !== baseTable.PREFIX.toLowerCase())) throw new Error(`[${ this }]: Cannot resolve incoming path to base table ${ baseTable.EXPR }.`);
		const joinAlias = `_view:${ [baseKey, rhs.table.PREFIX, rhs.table.NAME, joinKey].join(':') }`;
		const joint = () => this.JOINT = stmtNode.JOIN_LIST.find(joint => joint.ALIAS.NAME.toLowerCase() === joinAlias.toLowerCase());
		if (!joint()) {
			// Implement the join for the first time
			const baseAlias = this.$trace('get:node:table').ALIAS?.NAME || baseTable.NAME;
			const joinKeyAlias = `${ joinKey }:${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }`;
			stmtNode.leftJoin( j => j.query( q => q.select( field => field.name( joinKey ).as( joinKeyAlias ) ), q => q.from([rhs.table.PREFIX,rhs.table.NAME].filter(s => s)) ) )
				.with({ IS_SMART_JOIN: true }).as(joinAlias)
				.on( on => on.equals([joinAlias,joinKeyAlias], [baseAlias,baseKey]) );
			joint();
		}
		// For something like: author~>name, select "$view:fk_name:tbl_name:db_name:pk_name"."name" as "$path:unxnj"
		// Now on outer query, that would resolve to selecting "$view:fk_name:tbl_name:db_name:pk_name"."$path:unxnj" as "author"->"name"
		// For something like: author~>country->name, select "$view:fk_name:tbl_name:db_name:pk_name"."country"->"name" as "$path:unxnj"
		// Now on outer query, that would resolve to selecting "$view:fk_name:tbl_name:db_name:pk_name"."$path:unxnj" as "author"~>"country"->"name"
		this.JOINT.EXPR/*Query*/.select( field => field.expr(rhs.path.toJSON()).as(this.uuid) );
	}

	/**
	 * @inheritdoc
	 */
	toJSON() {
		return {
			lhs: this.LHS?.toJSON(),
			rhs: this.RHS?.toJSON(),
			operator: this.OPERATOR,
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if (![this.ARR_LEFT, this.ARR_RIGHT].includes(json?.operator)) return;
		const instance = (new this(context)).withFlag(...(json.flags || []));
		instance.path(json.lhs, json.operator, json.rhs);
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
		if (this.JOINT) return this.autoEsc([this.JOINT.ALIAS.NAME,this.uuid]).join('.');
		return `${ this.LHS } ${ this.OPERATOR } ${ this.RHS }`;
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const { tokens, matches } = Lexer.lex(expr, [this.ARR_LEFT, this.ARR_RIGHT], { limit: 1 });
		if (!matches.length) return;
		const instance = new this(context);
		const lhs = parseCallback(instance, tokens[0], [Identifier]);
		const rhs = parseCallback(instance, tokens[1], matches[0] === this.ARR_LEFT ? [this] : [this,JsonPath,Identifier]);
		instance.path(lhs, matches[0], rhs);
		return instance;
	}

	static factoryMethods = { path: (context, lhs, operator, rhs) => [this.ARR_LEFT,this.ARR_RIGHT].includes(operator) && new this(context) };
}

async function baseTableIdent() {
	const tblName = this.$trace('get:name:table');
	if (tblName) {
		const dbName = this.$trace('get:name:database');
		return Identifier.fromJSON(this, [
			dbName || await this.$trace('get:api:client')?.resolveName(tblName),
			tblName
		]);
	}
}