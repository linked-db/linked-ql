import AlterStatement from '../../ddl/alter/AlterStatement.js';
import CreateStatement from '../../ddl/create/CreateStatement.js';
import DropStatement from '../../ddl/drop/DropStatement.js';
import TableSchema from '../tbl/TableSchema.js';
import AbstractNode from '../AbstractNode.js';

export default class DatabaseSchema extends AbstractNode {

	/**
	 * Lists
	 */
	TABLES = [];
	TABLE_LIST = [];

    /**
     * @Symbol.iterator
     */
    get [ Symbol.iterator ] () { return this.TABLES[ Symbol.iterator ]; }

    /**
     * @var Array
     */
    get length() { return this.TABLES.length; }

	static get SUBTREE_PROPS() { return ['TABLES']; }

	/**
	 * Returns tables list
	 * 
	 * @returns Array
	 */
	tables() {
		if (!this.TABLES.length) return this.TABLE_LIST.slice();
		return this.TABLES.reduce((tbls, tbl) => tbls.concat(tbl.name()), []);
	}

    /**
	 * Returns foreign keys list
	 * 
	 * @returns Array
	 */
    foreignKeys() { return this.TABLES.reduce((fks, tbl) => fks.concat(tbl.foreignKeys()), []); }

	/**
	 * Returns a table or adds a table to the schema,
	 * 
	 * @param String|TableSchema table
	 * 
	 * @returns Any
	 */
	table(table) {
		if (typeof table === 'string') return this.TABLES.find(tbl => this.isSame(tbl.name(), table, 'ci'));
		return (this.build('TABLES', [table], TableSchema), this.TABLES[this.TABLES.length - 1]);
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param Database nodeB
	 * 
	 * @returns this
	 */
	diffWith(nodeB) {
		// DIFF NAME & KEEP
		super.diffWith(nodeB);
		// DIFF STRUCTURE
		const getNames = instance => new Set(instance.TABLES.map(node => node.NAME));
		const namesA = getNames(this);
		const namesB = getNames(nodeB);
		for (const name of new Set([...namesA, ...namesB])) {
			const nodeA = this.table(name);
			const tableB = nodeB.table(name);
			if (namesA.has(name) && !namesB.has(name)) {
				nodeA.keep(false);
			} else if (!namesA.has(name)) {
				this.table(tableB.toJSON());
			} else {
				nodeA.diffWith(tableB);
			}
		}
		return this;
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param AlterStatement altInstance
	 * 
	 * @returns this
	 */
	alterWith(altInstance) {
		const getTable = (name, ifExists = false) => {
			const node = this.table(name);
			if (!node && !ifExists) throw new Error(`TABLE ${ name } does not exist.`);
			return node;
		}
		for (const action of altInstance.ACTIONS) {
			if (action.CLAUSE === 'RENAME') {
				if (action.KIND) {
					getTable(action.ident().name()).name(action.argument().name());
				} else this.name(action.argument().name());
			} else if (action.CLAUSE === 'DROP') {
				const node = getTable(action.ident().name(), action.hasFlag('IF_EXISTS'));
				node?.keep(false);
			} else if (action.CLAUSE === 'ADD') {
				if (!action.hasFlag('IF_NOT_EXISTS') || !getTable(action.argument().name(), true)) {
					this.table(action.argument().toJSON());
				}
			} else if (action.CLAUSE === 'MODIFY') {
				const node = getTable(action.argument().name(), action.hasFlag('IF_EXISTS'));
				if (!node) continue;
				node.diffWith(action.argument());
			}
		}
		return this;
	}

	getAlt() {
		const instance = AlterStatement.fromJSON(this.CONTEXT, {
			kind: 'SCHEMA',
			ident: this.NAME, // Explicit old name important
			actions: [],
		});
		if (this.$NAME && !this.isSame(this.$NAME, this.NAME, 'ci')) {
			instance.rename(null, null, this.$NAME);
		}
		for (const tbl of this.TABLES) {
			if (typeof tbl.keep() !== 'boolean') {
				instance.SUBTREE.push(CreateStatement.fromJSON(this, { kind: 'TABLE', argument: tbl.clone() }));
			} else if (tbl.keep() === false) {
				instance.SUBTREE.push(DropStatement.fromJSON(this, { kind: 'TABLE', ident: tbl.name() }));
			} else {
				const alt = tbl.getAlt();
				if (alt.length) instance.SUBTREE.push(alt);
			}
		}
		return instance;
	}

	toJSON() {
		if (!this.TABLES.length) return super.toJSON({ tables: this.TABLE_LIST.slice() });
		return super.toJSON({ tables: this.TABLES.map(table => table.toJSON()) });
	}

	static fromJSON(context, json) {
		if (!(typeof json === 'object' && json) || ('tables' in json && !Array.isArray(json.tables))) return;
		return super.fromJSON(context, json, () => {
			const instance = new this(context);
			for (const tbl of json.tables || []) {
				if (typeof tbl === 'string') instance.TABLE_LIST.push(tbl);
				else instance.table(tbl);
			}
			return instance;
		});
	}

	stringify() { return this.autoEsc(this.name()); }

	static parse(context, expr, parseCallback) {
		const [name] = this.parseIdent(context, expr, true);
		if (!name) return;
		return (new this(context)).name(name);
	}

    $trace(request, ...args) {
		if (request === 'get:DATABASE_SCHEMA') return this;
		if (request === 'get:DATABASE_NAME') return this.NAME/*IMPORTANT: OLD NAME*/;
		return super.$trace(request, ...args);
	}
}