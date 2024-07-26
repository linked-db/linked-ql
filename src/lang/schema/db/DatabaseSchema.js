
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
		return (this.build('TABLES', [table], TableSchema), this);
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param Database nodeB
	 * 
	 * @returns this
	 */
	diffWith(nodeB) {
		// NAME and BASENAME
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
				nodeA.drop();
			} else if (!namesA.has(name)) {
				this.table(tableB.toJson());
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
				node?.drop();
			} else if (action.CLAUSE === 'ADD') {
				if (!action.hasFlag('IF_NOT_EXISTS') || !getTable(action.argument().name().NAME, true)) {
					this.table(action.argument().toJson());
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
		const instance = AlterStatement.fromJson(this.CONTEXT, {
			kind: 'SCHEMA',
			name: this.NAME.toJson(), // Explicit old name important
			actions: [],
		});
		if (this.$NAME && !this.isSame(this.$NAME.NAME, this.NAME.NAME, 'ci')) {
			instance.rename(null, null, this.$NAME.NAME);
		}
		for (const tbl of this.TABLES) {
			if (typeof tbl.keep() !== 'boolean') {
				instance.SUBTREE.push(CreateStatement.fromJson(this, { kind: 'TABLE', argument: tbl.clone() }));
			} else if (tbl.keep() === false) {
				instance.SUBTREE.push(DropStatement.fromJson(this, { kind: 'TABLE', name: tbl.name().toJson() }));
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
	cascadeAlt() {
		// Normalize subtree "keep" flags
		this.keep(this.keep(), 'auto');
		// We've been dropped or renamed?
		const altType = this.dropped() ? 'DOWN' : (this.$NAME && this.$NAME !== this.NAME ? 'RENAME' : null);
		if (altType) {
			// TODO: Check with all tables and call updateDatabaseReferences() on them
		}
		// Ask tables to also cascadeAlt()
		for (const tbl of this.TABLES) tbl.cascadeAlt();
		this.altsCascaded = true;
		return this;
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
        return {
			...super.toJson(),
            tables: this.TABLES.map(table => table.toJson()),
        }
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!json || ['tables'].some(key => key in json && !Array.isArray(json[key]))) return;
		return super.fromJson(context, json, () => {
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