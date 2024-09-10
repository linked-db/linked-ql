
import Identifier from '../components/Identifier.js';

export default Class => class extends Class {

	/**
	 * @inheritdoc
	 */
	$trace(request, ...args) {
		if (request === 'get:node:statement') return this;
		if (request === 'get:name:table' && this.KIND === 'TABLE') return this.NAME.NAME;
		if (request === 'get:name:database') {
			if (['SCHEMA','DATABASE'].includes(this.KIND)) return this.NAME.NAME;
			if (this.KIND === 'TABLE' && this.NAME.PREFIX) return this.NAME.PREFIX;
		}
		return super.$trace(request, ...args);
	}

	/**
	 * @inheritdoc
	 */
	async $schema(dbName, tblName) {
		if (!this._SCHEMAS) { this._SCHEMAS = await this.$trace('get:api:client').schemas(); }
		const dbSchema = this._SCHEMAS.database(dbName);
		return !tblName ? dbSchema?.clone() : dbSchema?.table(tblName).clone();
	}

    /**
	 * @inheritdoc
	 */
    clone() {
        const clone = super.clone();
        clone._SCHEMAS = this._SCHEMAS;
        return clone;
    }

	/**
	 * @inheritdoc
	 */
	name(value = undefined) {
		if (!arguments.length) return this.NAME;
		return (this.build('NAME', [value], Identifier), this)
	}
}