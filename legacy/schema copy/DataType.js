
import { _after, _before } from '@webqit/util/str/index.js';
import ExprInterface from '../../ExprInterface.js';

/**
 * ---------------------------
 * DataType class
 * ---------------------------
 */				

export default class DataType extends ExprInterface {

    /**
	 * @constructor
	 */
    constructor(name, maxLen, params = {}) {
        super();
        this.name = name;
        this.maxLen = maxLen;
        this.params = params;
    }

	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.name }${ this.maxLen ? `(${ this.maxLen })` : `` }`; }
	
	/**
	 * @inheritdoc
	 */
	toJson() {
		if (!this.maxLen) return this.name;
		return { name: this.name, maxLen: this.maxLen };
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (typeof json === 'string') { json = { name: json }; }
		if (!(typeof json === 'object' && json) || !json.name) return;
		const expr = json.name + (json.maxLen ? `(${ json.maxLen })` : '');
		const [name, maxLen] = parse(expr);
		if (!name) return;
		return new this(name, maxLen, params);
	}
    
    /**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		const [name, maxLen] = parse(expr);
        return new this(name.toUpperCase(), maxLen, params);
    }

	static pgFixedTypesRe = /(bigint|int8|bigserial|serial8|boolean|bool|box|bytea|cidr|circle|date|double[ ]+precision|float8|inet|integer|int|int4|json|jsonb|line|lseg|macaddr|macaddr8|money|path|pg_lsn|pg_snapshot|point|polygon|real|float4|smallint|int2|smallserial|serial2|serial|serial4|text|timetz|timestamptz|tsquery|tsvector|txid_snapshot|uuid|xml)/;
	static pgVariableTypesRe = /(bit|bit[ ]+varying|varbit|character|char|character[ ]+varying|varchar|interval|numeric|time|timestamp)(?:[ ]+)?(?:\(([\d, ]+)\))?/;
	static myFixedTypesRe = /(tinyint|smallint|mediumint|enum|set|tinyblob|mediumblob|longblob|geometry|longstring|geometrycollection|multilinestring|multipoint|multipolygon)/;
	static myVariableTypesRe = /(float|decimal|double|tinytext|mediumtext|longtext|binary|varbinary|blob)(?:[ ]+)?(?:\(([\d, ]+)\))?/;
}

const parse = expr => {
	let name, maxLen;
	for (const key of ['pgFixedTypesRe', 'pgVariableTypesRe', 'myFixedTypesRe', 'myVariableTypesRe']) {
		[ , name, maxLen ] = expr.match(new RegExp(DataType[key].source, 'i')) || [];
		if (name) break;
	}
	return [name, maxLen];
};