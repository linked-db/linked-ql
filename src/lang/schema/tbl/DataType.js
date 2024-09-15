import AbstractNode from '../../AbstractNode.js';	

export default class DataType extends AbstractNode {

	/**
	 * Instance properties
	 */
	SPEC = [];

    /**
	 * @constructor
	 */
    constructor(context, spec) {
        super(context);
        this.SPEC = spec;
    }
	
	toJSON() {
		if (this.SPEC.length === 1) return this.SPEC[0];
		return this.SPEC;
	}

	static fromJSON(context, json) {
		const spec = [].concat(json);
		if (typeof spec[0] !== 'string') return;
		const [name, precision, flags] = parse.call(this, spec[0]);
        // Note that some columns associated with system tables in information schema don't have standard types. e.g. "oid" on postgres
		if (!name) return new this(context, nornalizeSpec( ...[].concat(json)) );
        return new this(context, nornalizeSpec(name, ...precision.split(','), ...flags, ...spec.slice(1)));
	}
	
	stringify() {
		const [precision, flags] = this.SPEC.slice(1).reduce(([d, f], x) => /^\d+$/.test(x) ? [d.concat(x), f] : [d, f.concat(x)], [[], []]);
		return `${ this.SPEC[0] }${ precision.length ? `(${ precision.join(',') })` : `` }${ flags.length ? ` ${ flags.join(' ') }` : '' }`;
	}
    
	static parse(context, expr) {
		const [name, precision, flags] = parse.call(this, expr);
		if (!name) return;
        return new this(context, nornalizeSpec(name, ...precision.split(','), ...flags));
    }

	static pgFixedTypesRe = /^(bigint|int8|bigserial|serial8|boolean|bool|box|bytea|cidr|circle|date|double\s+precision|float8|inet|integer|int|int4|jsonb|json|line|lseg|macaddr8|macaddr|money|path|pg_lsn|pg_snapshot|point|polygon|real|float4|smallint|int2|smallserial|serial2|serial4|serial|text|timetz|timestamptz|tsquery|tsvector|txid_snapshot|uuid|xml)$/;
	static pgVariableTypesRe = /^(bit\s+varying|bit|varbit|character\s+varying|character|char|varchar|interval|numeric|timestamp|time)(?:\s+)?(?:\(([\d, ]+)\))?(\s+(?:with|without)\s+time\s+zone)?$/;
	static myFixedTypesRe = /^(tinyint|smallint|mediumint|enum|set|tinyblob|mediumblob|longblob|geometry|longstring|geometrycollection|multilinestring|multipoint|multipolygon)$/;
	static myVariableTypesRe = /^(float|decimal|double|tinytext|mediumtext|longtext|binary|varbinary|blob)(?:\s+)?(?:\(([\d, ]+)\))?$/;
}

function parse(expr) {
	let name, precision, flags;
	for (const key of ['pgFixedTypesRe', 'pgVariableTypesRe', 'myFixedTypesRe', 'myVariableTypesRe']) {
		[ , name, precision = '', ...flags ] = expr.match(new RegExp(this[key].source, 'i')) || [];
		if (name) break;
	}
	return [name, precision, flags];
}

/**
 * 
 * @param  {...any} spec 
 * 
 * @returns Array
 */
function nornalizeSpec(...spec) {
	return spec.map(s => /^\d+$/.test(s) ? parseFloat(s) : s?.trim().replace(/\s+/, ' ').toUpperCase()).filter(s => s);
}