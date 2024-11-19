import { AbstractNameableNode } from './AbstractNameableNode.js';

export class AbstractPrefixableNameableNode extends AbstractNameableNode {

	#prefix;
	#$prefix;

    prefix(value) {
		if (!arguments.length || typeof value === 'boolean') {
			let prefix = this.#prefix;
			if (!prefix && value === true) {
				const RefClass = this.constructor.PREFIX_TYPE[0];
				const $$prefix = [];
				if (this.contextNode instanceof AbstractPrefixableNameableNode) {
					$$prefix.push(this.contextNode.prefix(true).jsonfy());
				}
				if (this.contextNode instanceof AbstractNameableNode) {
					$$prefix.push(this.contextNode.name());
					prefix = RefClass?.fromJSON(this, $$prefix);
				} else prefix = RefClass?.fromJSON(this, '');
			}
			return prefix;
		}
		if (this.$diffTagHydrate()) {
			this.#$prefix = this.$castInputs([value], this.constructor.PREFIX_TYPE, this.#$prefix, '$prefix');
		} else this.#prefix = this.$castInputs([value], this.constructor.PREFIX_TYPE, this.#prefix, 'prefix');
        return this;
    }

	$prefix(...args) { return this.#$prefix || this.prefix(...args); }

	identifiesAs(value) {
		return super.identifiesAs(value)
		&& (!value?.prefix?.() || !!this.prefix()?.identifiesAs(value.prefix()));;
	}

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['prefix'])
		);
	}

    generateDiff(nodeB, options) {
		return this.diffMergeJsons({
			...super.generateDiff(nodeB, options),
			prefix: this.$prefix(!!nodeB.$prefix())?.jsonfy()
		}, {
			prefix: nodeB.$prefix()?.jsonfy()
		}, options);
    }

	/* -- I/O */

    static fromJSON(context, json, callback = null) {
        return super.fromJSON(context, json, (instance) => {
			if (json.prefix) instance.prefix(json.prefix);
			instance.$diffTagHydrate(json.$prefix, ($prefix) => instance.prefix($prefix));
			callback?.(instance);
		});
    }

	jsonfy(options = {}, jsonIn = {}) {
		const prefix = this.#prefix || options.fullyQualified 
			? (this.#prefix || this.prefix(true)).jsonfy(options)
			: {};
		return super.jsonfy(options, this.diffMergeJsons({
			...(prefix.name ? { prefix: prefix } : {}),
			...jsonIn
		}, {
			prefix: this.#$prefix?.jsonfy(options),
		}, options));
	}
}