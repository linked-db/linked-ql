
import AbstractNode from "../AbstractNode.js";
import Lexer from "../Lexer.js";
import Identifier from "../components/Identifier.js";

export default class AbstractStatement extends AbstractNode {

    constructor(context) {
        super(context);
        this._QUERY_BINDINGS = [];
        this._ROOT_SCHEMA = null;
    }

	get BINDINGS() { return this._QUERY_BINDINGS; }

	$trace(request, ...args) {
		if (request === 'get:STATEMENT_NODE') return this;
		if (request === 'get:QUERY_BINDINGS') return this._QUERY_BINDINGS;
        if (['get:TABLE_NAME', 'get:DATABASE_NAME'].includes(request) && !this._ongoingNameTrace) {
            let tbl = this.$trace('get:TABLE_NODE');
            // SELECT statements has a different structure:
            if (!(tbl instanceof Identifier)) {
                tbl = tbl.EXPR; // Table.EXPR:
                if (!(tbl instanceof Identifier)) {
                    this._ongoingNameTrace = true;
                    const result = tbl/*Parens*/.expr()/*Select*/.$trace(request, ...args);
                    delete this._ongoingNameTrace;
                    return result;
                }
            }
            if (tbl && request === 'get:TABLE_NAME') return tbl.name()
            if (tbl && request === 'get:DATABASE_NAME' && tbl.prefix()) return tbl.prefix();
        }
		if (request === 'get:ROOT_SCHEMA') {
			if (!this._ROOT_SCHEMA) this._ROOT_SCHEMA = this.CONTEXT?.$trace?.(request);
			return this._ROOT_SCHEMA;
		}
        return this.CONTEXT?.$trace?.(request, ...args);
	}

    clone() {
        const clone = super.clone();
        clone._QUERY_BINDINGS = this._QUERY_BINDINGS.slice(0);
        clone._ROOT_SCHEMA = this._ROOT_SCHEMA;
        return clone;
    }

    /**
     * @returns String
     */
    static mySubstitutePlaceholders(context, expr) {
        if ((context?.params?.inputDialect || context?.params?.dialect) !== 'mysql' || expr.indexOf('?') === -1) return expr;
		return Lexer.split(expr, ['?'], { blocks:[] }).reduce((expr, chunk, i) => !expr ? chunk : expr + '?' + i + chunk, null);
    }

    /**
     * @returns Bool
     */
    get expandable() { return false; }

    /**
     * @returns Node
     */
    async expand(inPlace = false) { return !inPlace ? this.clone() : this; }
}
