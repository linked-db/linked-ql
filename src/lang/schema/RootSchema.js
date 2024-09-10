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
	 * @inheritdoc
	 */
	$trace(request, ...args) {
		if (request === 'get:node:schemas') return this;
        return super.$trace(request, ...args);
	}

	/**
	 * Returns a table or adds a table to the schema,
	 * 
	 * @param String|TableSchema table
	 * 
	 * @returns Any
	 */
	database(database) {
		if (typeof database === 'string') return this.DATABASES.find(db => db.isSame(db.name().NAME, database, 'ci'));
		return (this.build('DATABASES', [database], DatabaseSchema), this.DATABASES[this.DATABASES.length - 1]);
	}

    /**
     * FOREIGN_KEY
     */
    foreignKeys() { return this.DATABASES.reduce((fks, db) => fks.concat(db.foreignKeys()), []); }

	/**
	 * @inheritdoc
	 */
	cascadeAlt(schemas = []) {
		// Normalize subtree "keep" flags
		this.keep(this.keep(), 'auto');
		const existingDB = schemas.filter(db => db.isSame(db.name().NAME, this.name().NAME, 'ci'));
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

	/**
	 * @inheritdoc
	 */
	toJSON() { return this.DATABASES.map(db => db.toJSON()); }

    /**
	 * @inheritdoc
	 */
    static fromJSON(context, json) {
        if (!Array.isArray(json)) return;
        const instance = new this(context);
        for (const db of json) instance.database(db);
        return instance;
    }
}