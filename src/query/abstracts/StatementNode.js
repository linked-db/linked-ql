
import Node from "./Node.js";
import Lexer from "../Lexer.js";

export default class StatementNode extends Node {

    /**
     * @constructor
     */
    constructor(context) {
        super(context);
        this._BINDINGS = [];
    }

    /**
     * @returns String
     */
    get type() { return this.constructor.name.toUpperCase(); }

    /**
	 * @inheritdoc
	 */
	get statementNode() { return this; }

    /**
	 * @inheritdoc
	 */
	get BINDINGS() { return this._BINDINGS; }

    /**
	 * @inheritdoc
	 */
    connectedNodeCallback(node) {}

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
