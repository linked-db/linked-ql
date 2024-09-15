import Identifier from '../../components/Identifier.js';
import AbstractNode from '../AbstractNode.js';

export default class Drop extends AbstractNode {

	/**
	 * Instance props.
	 */
	IDENT;

	ident(value) {
		if (!arguments.length) return this.IDENT;
		return (this.build('IDENT', [value], Identifier), this);
	}

	toJSON() {
		return {
			...(this.IDENT ? { ident: this.IDENT.toJSON() } : {}),
			...super.toJSON()
		};
	}

	static fromJSON(context, json) {
		// At least one of them:
		if (!json?.kind && !Identifier.fromJSON(context, json?.ident)) return;
		const instance = super.fromJSON(context, json);
		if (json.ident) instance?.ident(json.ident);
		return instance;
	}
	
	stringify() {
		const restrictOrCascade = this.getFlag('RESTRICT') || this.getFlag('CASCADE');
		let kind = this.KIND?.replace(/_/g, ' '), ident = this.IDENT;
		if (['PRIMARY_KEY', 'FOREIGN_KEY', 'CHECK'].includes(this.KIND)) {
			if (this.params.dialect === 'mysql') {
				if (this.KIND === 'PRIMARY_KEY') { ident = null; }
			} else { kind = 'CONSTRAINT'; }
		}
		return `${ this.CLAUSE }${ kind ? ` ${ kind }` : '' }${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' }${ ident ? ` ${ ident }` : '' }${ restrictOrCascade ? ` ${ restrictOrCascade }` : '' }`;
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, temporaryTable, kind, ifExists, name, restrictOrCascade ] = (new RegExp(`^${ this.CLAUSE }(\\s+TEMPORARY)?(?:\\s+(${ this.KINDS.map(s => s.replace(/_/g, '\\s+')).join('|') }))?(\\s+IF\\s+EXISTS)?(?:\\s+([\\s\\S]+?)(?:\\s+(RESTRICT|CASCADE|FORCE))?)?$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind?.replace(/\s+/g, '_').toUpperCase());
		if (name) instance.ident(parseCallback(context, name, [Identifier]));
		if (temporaryTable) instance.withFlag('TEMPORARY');
		if (ifExists) instance.withFlag('IF_EXISTS');
		if (restrictOrCascade) instance.withFlag(restrictOrCascade);
		return instance;
	}

	static get CLAUSE() { return 'DROP'; }
    static KINDS = ['COLUMN', 'CONSTRAINT', 'PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE_KEY', 'CHECK', 'INDEX', 'KEY', 'IDENTITY', 'EXPRESSION', 'DEFAULT', 'NOT_NULL', 'NULL', 'AUTO_INCREMENT', 'ON_UPDATE'];
}