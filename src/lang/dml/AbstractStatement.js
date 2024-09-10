
import AbstractNode from "../AbstractNode.js";
import Lexer from "../Lexer.js";
import Identifier from "../components/Identifier.js";

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
            let tbl = this.$trace('get:node:table');
            if (!(tbl instanceof Identifier)) {
                tbl = tbl.EXPR; // Must be instance Table
                if (!(tbl instanceof Identifier) && !this._ongoingNameTrace) {
                    this._ongoingNameTrace = true;
                    const result = tbl/*Parens*/.$trace(request, ...args);
                    delete this._ongoingNameTrace;
                    return result;
                }
            }
            if (tbl && request === 'get:name:table') return tbl.NAME
            if (tbl && request === 'get:name:database' && tbl.PREFIX) return tbl.PREFIX;
        }
        return super.$trace?.(request, ...args);
	}

    /**
	 * @inheritdoc
	 */
	async $schema(dbName, tblName) {
        if (!this._SCHEMAS) { this._SCHEMAS = await this.$trace('get:api:client').schemas(); }
		const dbSchema = this._SCHEMAS.database(dbName);
		return !tblName ? dbSchema?.clone() : dbSchema?.table(tblName).clone();
	}

    /**
	 * @inheritdoc
	 */
    clone() {
        const clone = super.clone();
        clone._BINDINGS = this._BINDINGS.slice(0);
        clone._SCHEMAS = this._SCHEMAS;
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
