import Lexer from '../../Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import AbstractNode from '../AbstractNode.js';

export default class Index extends AbstractNode {

	TYPE;
	$TYPE;
	COLUMNS = [];
	$COLUMNS = [];

	/**
	 * @inheritdoc
	 */
	static get WRITABLE_PROPS() { return ['TYPE', 'COLUMNS'].concat(super.WRITABLE_PROPS); }

	/**
	 * Sets/gets the index type,
	 * 
	 * @param Void|String value
	 * 
	 * @returns this
	 */
	type(value) {
		if (!arguments.length) return this[this.smartKey('TYPE')];
        return (this[this.smartKey('TYPE', true)] = value, this);
    }

	/**
	 * Sets/gets the index columns,
	 * 
	 * @param Void|Array columns
	 * 
	 * @returns this
	 */
	columns(columns) {
		if (!arguments.length) return this[this.smartKey('COLUMNS')];
		return (this[this.smartKey('COLUMNS', true)] = [].concat(columns), this);
    }

    /**
	 * Merges in new changes from another column instance,
	 * 
	 * @param Column columnB
	 * 
	 * @returns Void
	 */
    diffWith(nodeB) {
        super.diffWith(nodeB);
        if (!this.isSame(this.type(), nodeB.type())) this.type(nodeB.type());
        if (!this.isSame(this.columns(), nodeB.columns())) this.columns(nodeB.columns());
		return this;
    }

	/**
	 * @inheritdoc
	 */
	toJSON() {
		return super.toJSON({
			type: this.TYPE,
			...(this.$TYPE ? { $type: this.$TYPE } : {}),
			columns: this.COLUMNS,
			...(this.$COLUMNS.length ? { $columns: this.$COLUMNS } : {}),
		});
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if (typeof json?.type !== 'string' || !/^(INDEX|KEY|FULLTEXT)$/i.test(json.type) || !json.columns?.length) return;
		return super.fromJSON(context, json, () => {
			const instance = (new this(context))
				.columns(json.columns)
				.type(json.type);
			instance.hardSet(json.$columns, val => instance.columns(val));
			instance.hardSet(json.$type, val => instance.type(val));
			return instance;
		});
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.type() }${ this.name() ? ` ${ this.name() }` : '' } (${ this.columns().join(', ') })`; }

    /**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [ match, type, rest ] = /^((?:(?:FULLTEXT|SPATIAL)(?:\s+INDEX|\s+KEY)?)|(?:INDEX|KEY))([\s\S]+)$/i.exec(expr) || [];
        if (!match) return;
		const [ namePart, columnsPart ] = Lexer.split(rest, []);
		const [name] = this.parseIdent(context, namePart.trim(), true);
		const columns = Lexer.split(_unwrap(columnsPart, '(', ')'), [',']).map(columnExpr => {
			return this.parseIdent(context, columnExpr.trim(), true)[0];
		});
        return (new this(context))
			.type(type.replace(/\s+(INDEX|KEY)/i, '').toUpperCase())
			.columns(columns)
			.name(name);
    }
}