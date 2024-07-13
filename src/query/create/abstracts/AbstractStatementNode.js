
import Node from "../../abstracts/Node.js";
import AbstractNode from "./AbstractNode.js";

export default class AbstractStatementNode extends AbstractNode {

	static Node = Node;

	/**
	 * Instance properties
	 */
	BASENAME;
	$BASENAME;

    /**
	 * @inheritdoc
	 */
	get statementNode() { return this }

    /**
	 * @inheritdoc
	 */
    connectedNodeCallback(node) {}

	/**
	 * Returns name or sets basename
	 * 
	 * @param Void|String basename
	 * 
	 * @returns String
	 */
	basename(basename) {
		if (!arguments.length) return this[this.smartKey('BASENAME')];
        return (this[this.smartKey('BASENAME', true)] = basename, this);
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			...(this.BASENAME ? { basename: this.BASENAME } : {}),
			...(this.$BASENAME ? { $basename: this.$BASENAME } : {}),
			...super.toJson(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json, callback = null) {
		if ((json?.basename && typeof json.basename !== 'string') || (json.$basename && typeof json.$basename !== 'string')) return;
		return super.fromJson(context, json, () => {
			const instance = callback ? callback() : new this(context);
			instance.hardSet(() => instance.basename(json.basename));
			instance.hardSet(json.$basename, val => instance.basename(val));
			return instance;
		});
	}
}