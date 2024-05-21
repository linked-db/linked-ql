
import { _after, _before } from '@webqit/util/str/index.js';
import Node from '../abstracts/Node.js';		

export default class DataType extends Node {

	/**
	 * Instance properties
	 */
	NAME = '';
	PRECISION = 0;

    /**
	 * @constructor
	 */
    constructor(context, name, precision) {
        super(context);
        this.NAME = name;
        this.PRECISION = precision;
    }
	
	/**
	 * @inheritdoc
	 */
	toJson() {
		if (!this.PRECISION) return this.NAME;
		return { name: this.NAME, precision: this.PRECISION };
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.NAME }${ this.PRECISION ? `(${ this.PRECISION })` : `` }`; }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json === 'string') { json = { name: json }; }
		if (!(typeof json === 'object' && json) || typeof json.name !== 'string') return;
		const expr = json.name + (json.precision ? `(${ json.precision })` : '');
		const [name, precision] = parse(expr);
		if (!name) return;
		return new this(context, name, precision);
	}
    
    /**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [name, precision] = parse(expr);
		if (!name) return;
        return new this(context, name.toUpperCase(), precision);
    }

	static pgFixedTypesRe = /(bigint|int8|bigserial|serial8|boolean|bool|box|bytea|cidr|circle|date|double\s+precision|float8|inet|integer|int|int4|json|jsonb|line|lseg|macaddr|macaddr8|money|path|pg_lsn|pg_snapshot|point|polygon|real|float4|smallint|int2|smallserial|serial2|serial|serial4|text|timetz|timestamptz|tsquery|tsvector|txid_snapshot|uuid|xml)/;
	static pgVariableTypesRe = /(bit|bit\s+varying|varbit|character|char|character\s+varying|varchar|interval|numeric|time|timestamp)(?:\s+)?(?:\(([\d, ]+)\))?/;
	static myFixedTypesRe = /(tinyint|smallint|mediumint|enum|set|tinyblob|mediumblob|longblob|geometry|longstring|geometrycollection|multilinestring|multipoint|multipolygon)/;
	static myVariableTypesRe = /(float|decimal|double|tinytext|mediumtext|longtext|binary|varbinary|blob)(?:\s+)?(?:\(([\d, ]+)\))?/;
}

const parse = expr => {
	let name, precision;
	for (const key of ['pgFixedTypesRe', 'pgVariableTypesRe', 'myFixedTypesRe', 'myVariableTypesRe']) {
		[ , name, precision ] = expr.match(new RegExp(DataType[key].source, 'i')) || [];
		if (name) break;
	}
	return [name, precision];
};