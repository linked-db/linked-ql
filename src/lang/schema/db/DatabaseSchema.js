import AbstractSchema from '../AbstractSchema.js';
import CreateStatement from '../../ddl/create/CreateStatement.js';
import AlterStatement from '../../ddl/alter/AlterStatement.js';
import DropStatement from '../../ddl/drop/DropStatement.js';
import Identifier from '../../components/Identifier.js';
import TableSchema from '../tbl/TableSchema.js';

export default class DatabaseSchema extends AbstractSchema {

	/**
	 * Lists
	 */
	TABLES = [];

	/**
	 * @inheritdoc
	 */
	static get SUBTREE_PROPS() { return ['TABLES']; }

    /**
	 * @inheritdoc
	 */
    $trace(request, ...args) {
		if (request === 'get:schema:database') return this;
		if (request === 'get:name:database') return this.NAME.NAME;
		return super.$trace(request, ...args);
	}

	/**
	 * Returns a table or adds a table to the schema,
	 * 
	 * @param String|TableSchema table
	 * 
	 * @returns Any
	 */
	table(table) {
		if (typeof table === 'string') return this.TABLES.find(tbl => this.isSame(tbl.name().NAME, table, 'ci'));
		return (this.build('TABLES', [table], TableSchema), this.TABLES[this.TABLES.length - 1]);
	}

    /**
     * FOREIGN_KEY
     */
    foreignKeys() { return this.TABLES.reduce((fks, tbl) => fks.concat(tbl.foreignKeys()), []); }

	/**
	 * Apply changes to this schema.
	 * 
	 * @param Database nodeB
	 * 
	 * @returns this
	 */
	diffWith(nodeB) {
		// NAME and PREFIX
		super.diffWith(nodeB);
		// DIFF STRUCTURE
		const getTable = (instance, name) => instance.TABLES.find(node => this.isSame(node.NAME.NAME, name, 'ci'));
		const getNames = instance => new Set(instance.TABLES.map(node => node.NAME.NAME));
		const namesA = getNames(this);
		const namesB = getNames(nodeB);
		for (const name of new Set([...namesA, ...namesB])) {
			const nodeA = getTable(this, name);
			const tableB = getTable(nodeB, name);
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
			const node = this.TABLES.find(node => this.isSame(node.NAME.NAME, name, 'ci'));
			if (!node && !ifExists) throw new Error(`TABLE ${ name } does not exist.`);
			return node;
		}
		for (const action of altInstance.ACTIONS) {
			if (action.CLAUSE === 'RENAME') {
				if (action.KIND) {
					getTable(action.name()).name(action.argument());
				} else this.name(action.argument());
			} else if (action.CLAUSE === 'DROP') {
				const node = getTable(action.name(), action.hasFlag('IF_EXISTS'));
				node?.keep(false);
			} else if (action.CLAUSE === 'ADD') {
				if (!action.hasFlag('IF_NOT_EXISTS') || !getTable(action.argument().name().NAME, true)) {
					this.table(action.argument().toJSON());
				}
			} else if (action.CLAUSE === 'MODIFY') {
				const node = getTable(action.argument().name().NAME, action.hasFlag('IF_EXISTS'));
				if (!node) continue;
				node.diffWith(action.argument());
			}
		}
		return this;
	}

	/**
	 * @inheritdoc
	 */
	getAlt() {
		const instance = AlterStatement.fromJSON(this.CONTEXT, {
			kind: 'SCHEMA',
			name: this.NAME.toJSON(), // Explicit old name important
			actions: [],
		});
		if (this.$NAME && !this.isSame(this.$NAME.NAME, this.NAME.NAME, 'ci')) {
			instance.rename(null, null, this.$NAME.NAME);
		}
		for (const tbl of this.TABLES) {
			if (typeof tbl.keep() !== 'boolean') {
				instance.SUBTREE.push(CreateStatement.fromJSON(this, { kind: 'TABLE', argument: tbl.clone() }));
			} else if (tbl.keep() === false) {
				instance.SUBTREE.push(DropStatement.fromJSON(this, { kind: 'TABLE', name: tbl.name().toJSON() }));
			} else {
				const alt = tbl.getAlt();
				if (alt.length) instance.SUBTREE.push(alt);
			}
		}
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	toJSON() { return super.toJSON({ tables: this.TABLES.map(table => table.toJSON()) }); }

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if (!json || ['tables'].some(key => key in json && !Array.isArray(json[key]))) return;
		return super.fromJSON(context, json, () => {
			const instance = new this(context);
			for (const tbl of json.tables || []) instance.table(tbl);
			return instance;
		});
	}

	/**
	 * @inheritdoc
	 */
	stringify() { return this.name() + ''; }

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const instance = new this(context);
		instance.name(parseCallback(instance, expr.trim(), [Identifier]));
		return instance;
	}
}