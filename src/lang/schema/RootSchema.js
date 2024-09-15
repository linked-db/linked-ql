import DatabaseSchema from './db/DatabaseSchema.js';
import AbstractNode from '../AbstractNode.js';

export default class RootSchema extends AbstractNode {

	/**
	 * Instance props.
	 */
	DATABASES = [];

    /**
     * @Symbol.iterator
     */
    get [ Symbol.iterator ] () { return this.DATABASES[ Symbol.iterator ]; }

    /**
     * @var Array
     */
    get length() { return this.DATABASES.length; }

	/**
	 * Returns database list
	 * 
	 * @returns Array
	 */
	databases() { return this.DATABASES.map(db => db.name()); }

	/**
	 * Returns tables list
	 * 
	 * @returns Array
	 */
	tables() { return this.DATABASES.reduce((tbls, db) => tbls.concat(db.tables().map(tbl => [db.name(), tbl])), []); }

    /**
	 * Returns foreign keys list
	 * 
	 * @returns Array
	 */
    foreignKeys() { return this.DATABASES.reduce((fks, db) => fks.concat(db.foreignKeys()), []); }

	/**
	 * Returns a table or adds a table to the schema,
	 * 
	 * @param String|TableSchema table
	 * 
	 * @returns Any
	 */
	database(database) {
		if (typeof database === 'string') return this.DATABASES.find(db => db.isSame(db.name(), database, 'ci'));
		return (this.build('DATABASES', [database], DatabaseSchema), this.DATABASES[this.DATABASES.length - 1]);
	}

	/**
	 * Finds the DB prefix for a given table name
	 * 
	 * @param String name
	 * 
	 * @returns Array
	 */
	findPath(name, defaultToFirst = false) {
		const path = this.tables().find(tbl => tbl[1].toLowerCase() === name.toLowerCase())?.[0];
		if (!path && defaultToFirst) return this.databases()[0];
		return path;
	}

	cascadeAlt(schemas = []) {
		// Normalize subtree "keep" flags
		this.keep(this.keep(), 'auto');
		const existingDB = schemas.filter(db => db.isSame(db.name(), this.name(), 'ci'));
		// We've been dropped or renamed?
		const altType = this.dropped() ? 'DOWN' : (this.$NAME && this.$NAME !== this.NAME ? 'RENAME' : null);
		if (altType === 'DOWN') schemas = schemas.filter(db => db !== existingDB);
		if (altType) {
			// Check with all tables and call updateDatabaseReferences() on them
			for (const tbl of schemas.reduce((tbls, db) => tbls.concat(db.TABLES))) {
				tbl.updateDatabaseReferences(this, altType);
			}
		}
		// Ask tables to also cascadeAlt()
		for (const tbl of this.TABLES) tbl.cascadeAlt();
		this.altsCascaded = true;
		return this;
	}

	cascadeAlt() {
		// Normalize subtree "keep" flags
		this.keep(this.keep(), 'auto');
		const getAltType = node => node.dropped() ? 'DOWN' : (node.$NAME && !this.isSame(node.$NAME, node.NAME, 'ci') ? 'RENAME' : null);
		// We've been dropped or renamed?
		const altType = getAltType(this);
		if (altType) {
			// TODO: Check with all tables and call updateTableReferences() on them
		}
		// A column in here was dropped or renamed?
		for (const col of this.COLUMNS) {
			const altType = getAltType(col);
			if (!altType) continue;
			// Check with our own references to columns
			for (const cons of this.CONSTRAINTS) {
				if (cons instanceof CheckConstraint) continue;
				const targetList = cons.$COLUMNS.length ? cons.$COLUMNS : cons.COLUMNS;
				const index = targetList.indexOf(col.NAME);
				if (index > -1) {
					if (altType === 'DOWN') targetList.splice(index, 1);
					else if (altType === 'RENAME') targetList[index] = col.$NAME;
				};
			}
			// TODO: Check with all tables and call updateColumnReferences() on them
		}
		this.altsCascaded = true;
		return this;
	}

	updateDatabaseReferences(db, altType) {
		// A database was dropped or renamed. We check with our own references to databases
		for (const fk of this.foreignKeys()) {
			// Where referencing the old name
			if (fk.targetTable().PREFIX !== db.NAME) continue;
			if (altType === 'DOWN') fk.keep(false);
			else if (altType === 'RENAME') fk.targetTable().name([db.$NAME,fk.targetTable().NAME]);
		}
	}

	updateTableReferences(tbl, altType) {
		// A table was dropped or renamed. We check with our own references to tables
		for (const fk of this.foreignKeys()) {
			if (fk.targetTable().PREFIX && tbl.PREFIX && node.targetTable().prefix() !== tbl.prefix()) continue;
			if (node.targetTable().name() === tbl.NAME) {
				if (altType === 'DOWN') node.keep(false);
				else if (altType === 'RENAME') node.targetTable().name(tbl.$NAME);
			};
		}
	}

	updateColumnReferences(col, altType) {
		// A column somewhere was dropped or renamed. We check with our own references to columns
		for (const node of this.NODES) {
			if (!(node instanceof ForeignKey)) continue;
			if (node.targetTable().prefix() && col.$trace('get:DATABASE_NAME') && node.targetTable().prefix() !== col.$trace('get:DATABASE_NAME')) continue;
			if (node.targetTable().name() !== col.$trace('get:TABLE_NAME')) continue;
			const targetList = cons.$TARGET_COLUMNS.length ? cons.$TARGET_COLUMNS : cons.TARGET_COLUMNS;
			const index = targetList.indexOf(col.NAME);
			if (index > -1) {
				if (altType === 'DOWN') targetList.splice(index, 1);
				else if (altType === 'RENAME') targetList[index] = col.$NAME;
			};
		}
	}

	toJSON() { return this.DATABASES.map(db => db.toJSON()); }

    static fromJSON(context, json) {
        if (!Array.isArray(json)) return;
        const instance = new this(context);
        for (const db of json) instance.database(db);
        return instance;
    }

	$trace(request, ...args) {
		if (request === 'get:ROOT_SCHEMA') return this;
        return super.$trace(request, ...args);
	}
}