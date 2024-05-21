import Lexer from '../Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import Node from '../abstracts/Node.js';

export default class Index extends Node {

	/**
	 * Instance properties
	 */
	INDEX_NAME = '';
	TYPE = '';
	COLUMNS = [];

    /**
	 * @constructor
	 */
    constructor(context, indexName, type, columns) {
        super(context);
        this.INDEX_NAME = indexName;
        this.TYPE = type;
        this.COLUMNS = columns;
    }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			type: this.TYPE,
			columns: this.COLUMNS,
			...(this.INDEX_NAME ? { indexName: this.INDEX_NAME } : {})
		};
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.TYPE }${ this.INDEX_NAME ? ` ${ this.INDEX_NAME }` : '' } (${ this.COLUMNS.join(', ') })`; }

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
        return new this(context, name, type.toUpperCase(), columns);
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json.indexName !== 'string' && (typeof json?.type !== 'string' || !json.type.match(/INDEX|KEY|FULLTEXT/i))) return;
		return new this(context, json.indexName, json.type, json.columns);
	}

    /**
     * @property Object
     */
    static attrEquivalents = {
        fulltext: 'FULLTEXT',
        index: 'INDEX',
    };
}