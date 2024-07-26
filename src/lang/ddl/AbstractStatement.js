
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
			if (this.KIND === 'TABLE' && this.NAME.BASENAME) return this.NAME.BASENAME;
		}
		return super.$trace(request, ...args);
	}

	/**
	 * @inheritdoc
	 */
	name(value = undefined) {
		if (!arguments.length) return this.NAME;
		return (this.build('NAME', [value], Identifier), this)
	}
}