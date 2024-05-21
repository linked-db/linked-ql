import Lexer from '@webqit/util/str/Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import IndexInterface from './IndexInterface.js';

/**
 * ---------------------------
 * Index class
 * ---------------------------
 */				

export default class Index extends IndexInterface {

    /**
	 * @constructor
	 */
    constructor(indexName, type, columns, params = {}) {
        super();
        this.indexName = indexName;
        this.type = type;
        this.columns = columns;
        this.params = params;
    }

	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.type }${ this.indexName ? ` ${ this.indexName }` : '' } (${ this.columns.join(', ') })`; }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			type: this.type,
			columns: this.columns,
			...(this.indexName ? { indexName: this.indexName } : {})
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (json.indexName || (typeof json.type === 'string' && json.type.match(/INDEX|KEY|FULLTEXT/i))) {
			return new this(json.indexName, json.type, json.columns, params);
		}
	}

    /**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
        let [ , type, indexName = '', columns ] = (new RegExp(this.regex.source, this.regex.flags)).exec(expr) || [];
        if (!type) return;
        columns = Lexer.split(_unwrap(columns, '(', ')'), [',']).map(col => col.trim());
        return new this(indexName.trim(), type.toUpperCase(), columns, params);
    }

    /**
	 * @property RegExp
	 */
    static regex = /^((?:(?:FULLTEXT|SPATIAL)(?:[ ]+INDEX|[ ]+KEY)?)|(?:INDEX|KEY))([ ]+\w+)?(?:[ ]+)?(\([^\)]+\))/i;

    /**
     * @property Object
     */
    static attrEquivalents = {
        fulltext: 'FULLTEXT',
        index: 'INDEX',
    };
}