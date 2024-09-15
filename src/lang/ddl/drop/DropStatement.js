
import AbstractStatement from '../AbstractStatement.js';
import Drop from './Drop.js';

export default class DropStatement extends AbstractStatement(Drop) {
	
	stringify() {
		const restrictOrCascade = this.getFlag('RESTRICT') || this.getFlag('CASCADE');
		let ident = this.ident();
		if (!ident.prefix() && this.KIND === 'TABLE') ident = ident.clone().prefix(this.$trace('get:DATABASE_NAME'));
		return `${ this.CLAUSE }${ this.getFlag('TEMPORARY') ? ' TEMPORARY' : '' } ${ this.KIND }${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ ident }${ restrictOrCascade ? ` ${ restrictOrCascade }` : '' }`;
	}

	static get CLAUSE() { return 'DROP'; }
    static KINDS = ['TABLE', 'SCHEMA', 'DATABASE'];
}