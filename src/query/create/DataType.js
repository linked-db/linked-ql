
import { _after, _before } from '@webqit/util/str/index.js';
import Node from '../abstracts/Node.js';		

export default class DataType extends Node {

	/**
	 * Instance properties
	 */
	NAME;
	PRECISION;
	TZ;

    /**
	 * @constructor
	 */
    constructor(context, name, precision, tz) {
        super(context);
        this.NAME = name;
        this.PRECISION = precision;
        this.TZ = tz;
    }
	
	/**
	 * @inheritdoc
	 */
	toJson() {
		if (!this.PRECISION) return this.NAME;
		return { name: this.NAME, precision: this.PRECISION, ...(this.TZ ? { tz: this.TZ } : {}) };
	}

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
	stringify() { return `${ this.NAME }${ this.PRECISION ? `(${ this.PRECISION })` : `` }${ this.TZ ? ` ${ this.TZ }` : '' }`; }
    
    /**
	 * @inheritdoc
	 */
	static parse(context, expr) {
		const [name, precision, tz = ''] = parse(expr);
		if (!name) return;
        return new this(context, name.toUpperCase(), precision, tz.trim().replace(/\s+/, ' ').toUpperCase());
    }

	static pgFixedTypesRe = /(bigint|int8|bigserial|serial8|boolean|bool|box|bytea|cidr|circle|date|double\s+precision|float8|inet|integer|int|int4|jsonb|json|line|lseg|macaddr8|macaddr|money|path|pg_lsn|pg_snapshot|point|polygon|real|float4|smallint|int2|smallserial|serial2|serial4|serial|text|timetz|timestamptz|tsquery|tsvector|txid_snapshot|uuid|xml)/;
	static pgVariableTypesRe = /(bit\s+varying|bit|varbit|character\s+varying|character|char|varchar|interval|numeric|timestamp|time)(?:\s+)?(?:\(([\d, ]+)\))?(\s+(?:with|without)\s+time\s+zone)?/;
	static myFixedTypesRe = /(tinyint|smallint|mediumint|enum|set|tinyblob|mediumblob|longblob|geometry|longstring|geometrycollection|multilinestring|multipoint|multipolygon)/;
	static myVariableTypesRe = /(float|decimal|double|tinytext|mediumtext|longtext|binary|varbinary|blob)(?:\s+)?(?:\(([\d, ]+)\))?/;
}

const parse = expr => {
	let name, precision, tz;
	for (const key of ['pgFixedTypesRe', 'pgVariableTypesRe', 'myFixedTypesRe', 'myVariableTypesRe']) {
		[ , name, precision, tz ] = expr.match(new RegExp(DataType[key].source, 'i')) || [];
		if (name) break;
	}
	return [name, precision, tz];
};