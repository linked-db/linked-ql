
import Node from "./Node.js";
import Lexer from "../Lexer.js";

export default class StatementNode extends Node {

    /**
     * @returns String
     */
    get type() { return this.constructor.name.toUpperCase(); }

    /**
	 * @inheritdoc
	 */
	get statementNode() { return this }

    /**
	 * @inheritdoc
	 */
    connectedNodeCallback(node) {}

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
    async expand(asClone = false) { return asClone ? this.clone() : this; }
}
