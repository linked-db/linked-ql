
import AbstractNode from "../AbstractNode.js";
import Lexer from "../Lexer.js";
import Identifier from "../componets/Identifier.js";

export default class AbstractStatement extends AbstractNode {

    /**
     * @constructor
     */
    constructor(context) {
        super(context);
        this._BINDINGS = [];
    }

    /**
	 * @inheritdoc
	 */
	get BINDINGS() { return this._BINDINGS; }

	/**
	 * @inheritdoc
	 */
	$trace(request, ...args) {
		if (request === 'get:node:statement') return this;
		if (request === 'get:node:statement.bindings') return this._BINDINGS;
        if (request.startsWith('get:name:')) {
            const tbl = this.$trace('get:node:table');
            if (tbl && !(tbl.EXPR instanceof Identifier) && !this._ongoingNameTrace) {
                this._ongoingNameTrace = true;
                const result = tbl.EXPR/*Parens*/.$trace(request, ...args);
                delete this._ongoingNameTrace;
                return result;
            }
            if (tbl && request === 'get:name:table') return tbl.EXPR.NAME
            if (tbl && request === 'get:name:database' && tbl.EXPR.BASENAME) return tbl.EXPR.BASENAME;
        }
        return super.$trace?.(request, ...args);
	}

    /**
	 * @inheritdoc
	 */
    clone() {
        const clone = super.clone();
        if (this._BINDINGS.length) clone._BINDINGS = this._BINDINGS.slice(0);
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
