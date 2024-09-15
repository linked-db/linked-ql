import AbstractNode from './AbstractNode.js';

export default class AbstractSchema extends AbstractNode {

	/**
	 * Instance properties
	 */
	PREFIX;
	$PREFIX;
	
	/**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['PREFIX']; }

	/**
	 * Returns prefix or sets prefix
	 * 
	 * @param Void|String prefix
	 * 
	 * @returns String
	 */
	prefix(prefix) {
		if (!arguments.length) return this[this.smartKey('PREFIX')];
        return (this[this.smartKey('PREFIX', true)] = prefix, this);
	}

    diffWith(nodeB) {
		super.diffWith(nodeB);
        if (!this.isSame(nodeB.prefix(), this.prefix())) { this.prefix(nodeB.prefix()); }
    }

	toJSON(json = {}) {
		return super.toJSON({
			...(this.PREFIX ? { prefix: this.PREFIX } : {}),
			...(this.$PREFIX ? { $prefix: this.$PREFIX } : {}),
			...json
		});
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, () => {
			const instance = callback ? callback() : new this(context);
			instance.hardSet(() => instance.prefix(json.prefix));
			instance.hardSet(json.$prefix, val => instance.prefix(val));
			return instance;
		});
	}

	$trace(request, ...args) {
		if (request === 'get:node:schema') return this;
        return super.$trace(request, ...args);
	}
}