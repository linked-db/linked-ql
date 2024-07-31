
import AbstractNode from '../AbstractNode.js';
import DataType from '../../schema/tbl/DataType.js';
import Identifier from '../../components/Identifier.js';

export default class Set extends AbstractNode {

	/**
	 * Instance props.
	 */
	ARGUMENT;

	/**
	 * @inheritdoc
	 */
	argument(value = undefined) {
		if (!arguments.length) return this.ARGUMENT;
		if (['DATA_TYPE','TYPE'].includes(this.KIND)) {
			this.build('ARGUMENT', [value], DataType);
		} else if (this.KIND === 'SCHEMA') {
			this.build('ARGUMENT', [value], Identifier);
		} else { this.ARGUMENT = value; }
		return this;
	}

	/**
	 * @inheritdoc
	 */
	toJson() { return { argument: this.ARGUMENT?.toJson?.() || this.ARGUMENT, ...super.toJson(), }; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!json?.kind) return;
        return super.fromJson(context, json)?.argument(json.argument);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		if (this.KIND === 'IDENTITY') return `SET GENERATED ${ /^ALWAYS$/i.test(this.ARGUMENT) ? 'AS ALWAYS' : 'BY DEFAULT' }`;
		return `${ this.CLAUSE } ${ this.KIND.replace(/_/g, ' ') }${ this.ARGUMENT ? ` ${ this.ARGUMENT }` : '' }`;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, kind, argument ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s === 'IDENTITY' ? 'GENERATED' : s.replace(/_/g, '\\s+')).join('|') })(?:\\s+([\\s\\S]+))?$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const isIdentity = /^GENERATED$/i.test(kind);
		const instance = new this(context, isIdentity ? 'IDENTITY' : kind.replace(/\s+/g, '_').toUpperCase());
		if (/^(DATA\s+)?TYPE$/i.test(kind)) {
			instance.argument(parseCallback(instance, argument, [DataType]));
		} else if (/^SCHEMA$/i.test(kind)) {
			instance.argument(parseCallback(instance, argument, [Identifier]));
		} else instance.argument(isIdentity ? (/^AS\s+ALWAYS$/i.test(argument) ? 'always' : true) : argument);
		return instance;
	}

	static get CLAUSE() { return 'SET'; }
    static KINDS = ['SCHEMA', 'DATA_TYPE', 'TYPE', 'IDENTITY', 'DEFAULT', 'NOT_NULL', 'NULL', 'AUTO_INCREMENT', 'ON_UPDATE'];
}