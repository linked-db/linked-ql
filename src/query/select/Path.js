
import Lexer from '../Lexer.js';
import Identifier from './Identifier.js';
import JsonPath from './json/JsonPath.js';
import Node from '../abstracts/Node.js';

export default class Path extends Node {

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
		const getPrimaryKey = schema => schema.columns.find(col => col.primaryKey)?.name || schema.constraints.find(cons => cons.type === 'PRIMARY_KEY')?.columns[0];
		const getKeyDef = (schema, foreignKey) => schema.columns.find(col => col.name === foreignKey.NAME)?.references || schema.constraints.find(cons => cons.type === 'FOREIGN_KEY' && cons.columns.includes(foreignKey.NAME))?.references;
		const getSchema = async (tblName, dbName) => {
			const clientApi = this.rootNode.CONTEXT;
			const basename = dbName || await clientApi.getBasename(tblName);
			const dbApi = clientApi.database(basename);
			if (!(await dbApi.tables({ name: tblName })).length) return;
			return await dbApi.describeTable(tblName, { force: true });
		};
		if (!this.rootNode.CONTEXT) throw new Error(`No client API in context.`);
		if (this.isIncoming) {
			if (!(this.RHS instanceof Path)) throw new Error(`Unterminated path: ${ this.RHS }`);
			// --------------------------
			// === {foreignKey}LHS<-RHS{table...}
			let foreignKey_rhs, table_rhs, schema_rhs, path;
			if (this.RHS.isIncoming) {
				if (!(this.RHS.RHS instanceof Path)) throw new Error(`Unterminated path: ${ this.RHS.RHS }`);
				// === {foreignKey}LHS<-RHS{foreignKey_rhs<-table->?...}
				({ LHS: foreignKey_rhs/*Identifier*/, RHS/*Path*/: path } = this);
				schema_rhs = (await path.eval()).lhs.schema;
				table_rhs = Identifier.fromJson(this, schema_rhs);
			} else {
				// === {foreignKey}LHS<-RHS{table->path}
				({ LHS: foreignKey_rhs/*Identifier*/, RHS/*Path*/: { LHS: table_rhs/*Identifier*/, RHS: path/*Identifier|Path*/ } } = this);
				schema_rhs = await getSchema(table_rhs.NAME, table_rhs.BASENAME);
				if (!schema_rhs) throw new Error(`[${ this }]: The implied table ${ table_rhs } does not exist.`);
			}
			const keyDef_rhs = getKeyDef(schema_rhs, foreignKey_rhs);
			// Validate that schema_rhs has the implied foreign key (actingKey)
			if (!keyDef_rhs) throw new Error(`[${ this }]: Table ${ table_rhs } does not define the implied foreign key: ${ foreignKey_rhs }.`);
			// -------------
			// Get schema_lhs from keyDef
			const table_lhs = Identifier.fromJson(this, keyDef_rhs.basename ? [keyDef_rhs.basename,keyDef_rhs.table] : keyDef_rhs.table);
			const schema_lhs = await getSchema(table_lhs.NAME, table_lhs.BASENAME);
			if (!schema_lhs) throw new Error(`[${ this }]: The implied table ${ table_lhs } does not exist.`);
			// Get shcema_lhs's acting key (primary key) and validate
			const primaryKey_lhs = getPrimaryKey(schema_lhs);
			if (!primaryKey_lhs) throw new Error(`[${ this }]: Table ${ schema_lhs.name } does not define a primary key.`);
			// -------------
			// Put together
			return {
				lhs: { schema: schema_lhs, primaryKey: primaryKey_lhs, },
				rhs: { schema: schema_rhs, foreignKey: foreignKey_rhs, path, },
			};
		}
		// -------------
		// reference === {foreignKey}LHS->RHS{path}
		const table_lhs = this.statementNode.TABLES[0]?.EXPR/*Identifier*/;
		if (!table_lhs) throw new Error(`No tables in query.`);
		if (!(table_lhs instanceof Identifier)) throw new Error(`[${ this }]: Base query must not be derived.`);
		// Get lhs schema
		const schema_lhs = await getSchema(table_lhs.NAME, table_lhs.BASENAME);
		if (!schema_lhs) throw new Error(`[${ this }]: The implied table ${ table_lhs } does not exist.`);
		const { LHS: foreignKey_lhs/*Identifier*/, RHS: path/*Identifier|Path*/ } = this;
		// We get schema2 from schema_lhs
		const keyDef_lhs = getKeyDef(schema_lhs, foreignKey_lhs);
		// Validate that schema_lhs has the implied foreign key (foreignKey)
		if (!keyDef_lhs) throw new Error(`[${ this }]: Table ${ table_lhs } does not define the implied foreign key: ${ foreignKey_lhs }.`);
		// -------------
		// Get schema_rhs from keyDef!
		const table_rhs = Identifier.fromJson(this, keyDef_lhs.basename ? [keyDef_lhs.basename,keyDef_lhs.table] : keyDef_lhs.table);
		const schema_rhs = await getSchema(table_rhs.NAME, table_rhs.BASENAME || table_lhs.BASENAME);
		if (!schema_rhs) throw new Error(`[${ this }]: The implied table ${ table_rhs } does not exist.`);
		// Get shcema_lhs's acting key (primary key) and validate
		const primaryKey_rhs = getPrimaryKey(schema_rhs);
		if (!primaryKey_rhs) throw new Error(`[${ this }]: Table ${ table_rhs } does not define a primary key.`);
		// -------------
		// Put together
		return {
			lhs: { schema: schema_lhs, foreignKey: foreignKey_lhs, },
			rhs: { schema: schema_rhs, primaryKey: primaryKey_rhs, path, },
		};
	}

	/**
	 * Plots the relationship.
	 * 
	 * @returns Void
	 */
	async plot() {
		if (this.JOINT) return;
		// Resolve relation and validate
		const stmt = this.statementNode;
		const baseTable = stmt.TABLES[0];
		if (!baseTable) throw new Error(`No tables in query.`);
		if (!(baseTable.EXPR instanceof Identifier)) throw new Error(`[${ this }]: Base query must not be derived.`);
		// Do plotting
		const { lhs, rhs } = await this.eval();
		const baseKey = lhs.foreignKey || lhs.primaryKey;
		const joinKey = rhs.primaryKey || rhs.foreignKey;
		if (lhs.primaryKey/*then incoming reference*/ && lhs.schema.name.toLowerCase() !== baseTable.EXPR.NAME.toLowerCase()) throw new Error(`[${ this }]: Cannot resolve incoming path to base table ${ baseTable.EXPR }.`);
		const joinAlias = `$view:${ [baseKey, rhs.schema.basename, rhs.schema.name, joinKey].join(':') }`;
		const joint = () => this.JOINT = stmt.JOIN_LIST.find(joint => joint.ALIAS.NAME === joinAlias);
		if (!joint()) {
			// Implement the join for the first time
			const baseAlias = ['ALIAS','EXPR'].reduce((prev, key) => prev || baseTable[key]?.NAME, null);
			stmt.leftJoin( j => j.query( q => q.select(joinKey), q => q.from([rhs.schema.basename,rhs.schema.name]) ) )
				.with({ IS_SMART_JOIN: true }).as(joinAlias)
				.on( on => on.equals([joinAlias,joinKey], [baseAlias,baseKey]) );
			joint();
		}
		// For something like: author~>name, select "$view:fk_name:tbl_name:db_name:pk_name"."name" as "$path:unxnj"
		// Now on outer query, that would resolve to selecting "$view:fk_name:tbl_name:db_name:pk_name"."$path:unxnj" as "author"->"name"
		// For something like: author~>country->name, select "$view:fk_name:tbl_name:db_name:pk_name"."country"->"name" as "$path:unxnj"
		// Now on outer query, that would resolve to selecting "$view:fk_name:tbl_name:db_name:pk_name"."$path:unxnj" as "author"~>"country"->"name"
		this.JOINT.EXPR/*Query*/.select( field => field.expr(rhs.path.toJson()).as(this.uuid) );
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			lhs: this.LHS?.toJson(),
			rhs: this.RHS?.toJson(),
			operator: this.OPERATOR,
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
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