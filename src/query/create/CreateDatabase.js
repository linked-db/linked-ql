
import AlterDatabase from '../alter/AlterDatabase.js';
import AbstractStatementNode from './abstracts/AbstractStatementNode.js';
import CreateTable from './CreateTable.js';

export default class CreateDatabase extends AbstractStatementNode {

	/**
	 * Lists
	 */
	TABLES = [];

	/**
	 * @inheritdoc
	 */
	static get SUBTREE_PROPS() { return ['TABLES']; }

	/**
	 * Returns a table or adds a table to the schema,
	 * 
	 * @param String|CreateTable table
	 * 
	 * @returns Any
	 */
	table(table) {
		if (typeof table === 'string') return this.TABLES.find(tbl => tbl.name() === table);
		return (this.build('TABLES', [table], CreateTable), this);
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param AlterDatabase altInstance
	 * 
	 * @returns this
	 */
	alterWith(altInstance) {
		// -----
		const getTable = (name, ifExists = false) => {
			const node = this.table(name);
			if (!node && !ifExists) throw new Error(`TABLE ${ name } does not exist.`);
			return node;
		}
		// -----
		for (const action of altInstance.ACTIONS) {
			if (action.TYPE === 'RENAME') {
				this.name(action.ARGUMENT);
			} else if (action.TYPE === 'MOVE') {
				this.basename(action.ARGUMENT);
			} else if (action.TYPE === 'DROP') {
				const node = getTable(action.ARGUMENT, action.hasFlag('IF_EXISTS'));
				node?.status('DOWN');
			} else if (action.TYPE === 'NEW') {
				if (!action.hasFlag('IF_NOT_EXISTS') || !getTable(action.ARGUMENT.name(), true)) {
					this.table(action.ARGUMENT.toJson());
				}
			} else if (action.TYPE === 'ALTER') {
				const node = getTable(action.REFERENCE, action.hasFlag('IF_EXISTS'));
				if (!node) continue;
				node.alter(action.ARGUMENT);
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	getAlt() {
		const instance = (new AlterDatabase(this.CONTEXT)).name(this.NAME).basename(this.BASENAME);
		if (this.$NAME && this.NAME && this.$NAME !== this.NAME) {
			instance.addRename(this.$NAME);
		}
		if (this.$BASENAME && this.BASENAME && this.$BASENAME !== this.BASENAME) {
			instance.addMove(this.$BASENAME);
		}
		for (const tbl of this.TABLES) {
			if (tbl.status() === 'UP') {
				const alt = tbl.getAlt();
				if (alt.ACTIONS.length) instance.addAlt({ name: tbl.NAME, kind: 'TABLE' }, a => a.set(alt));
			} else if (tbl.status() === 'DOWN') {
				instance.addDrop({ name: [tbl.BASENAME || this.NAME, tbl.NAME], kind: 'TABLE' });
			} else {
				instance.addNew(tbl.clone());
			}
		}
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	
	/**
	 * @inheritdoc
	 */
	cascadeAlt() {
		// Normalize subtree statuses
		this.status(this.status(), true);
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
		if (['tables'].some(key => key in json && !Array.isArray(json[key]))) return;
		return super.fromJson(context, json, () => {
			const instance = new this(context);
			for (const tbl of json.tables || []) instance.table(tbl);
			return instance;
		});
	}

	/**
	 * @inheritdoc
	 */
	stringify() {
		const sql = [`CREATE SCHEMA${ this.hasFlag('IF_NOT_EXISTS') ? ' IF NOT EXISTS' : '' } ${ this.autoEsc(this.name()) }`];
		return [ ...sql, ...this.TABLES ].join(';\n');
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, ifNotExists, namePart ] = /^CREATE\s+DATABASE\s+(IF\s+NOT\s+EXISTS\s+)?(.+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const [name] = this.parseIdent(context, namePart.trim(), true) || [];
		if (!name) return;
		const instance = (new this(context)).name(name);
		if (ifNotExists) instance.withFlag('IF_NOT_EXISTS');
		return instance;
	}
}