export default Class => class extends Class {

    clone() {
        const clone = super.clone();
        clone._ROOT_SCHEMA = this._ROOT_SCHEMA;
        return clone;
    }

	$trace(request, ...args) {
		if (request === 'get:STATEMENT_NODE') return this;
		if (request === 'get:TABLE_NAME' && this.KIND === 'TABLE') return this.ident().name();
		if (request === 'get:DATABASE_NAME') {
			if (['SCHEMA','DATABASE'].includes(this.KIND)) return this.ident().name();
			if (this.KIND === 'TABLE' && this.ident().prefix()) return this.ident().prefix();
		}
		if (request === 'get:ROOT_SCHEMA') {
			if (!this._ROOT_SCHEMA) this._ROOT_SCHEMA = this.CONTEXT?.$trace?.(request);
			return this._ROOT_SCHEMA;
		}
		return this.CONTEXT?.$trace?.(request, ...args);
	}
}