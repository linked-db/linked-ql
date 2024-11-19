import { AbstractDiffableNode } from './AbstractDiffableNode.js';

export class AbstractNameableNode extends AbstractDiffableNode {

	#name;
	#$name;

    name(value) {
        if (!arguments.length) return this.#name;
		if (this.$diffTagHydrate() || (this.$nameLock() && this.#name)) {
			this.#$name = value;
		} else this.#name = value;
        return this;
    }

	$name() { return this.#$name || this.#name; }

	identifiesAs(value) {
		if (typeof value === 'string') {
			return this.$eq(this.#name, value, 'ci');
		}
		return super.identifiesAs(value);
	}

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['name'])
		);
	}

	generateDiff(nodeB, options) {
		return this.diffMergeJsons({
			...super.generateDiff(nodeB, options),
			name: this.$name()
		}, {
			name: nodeB.$name()
		}, options);
    }

	/* -- MODES */

	#$nameLock = false;
	$nameLock(set) {
		if (!arguments.length) return this.#$nameLock || !!this.contextNode?.$nameLock?.();
		if (typeof set === 'function') {
			const settingBefore = this.#$nameLock;
			this.#$nameLock = true;
			set();
			this.#$nameLock = settingBefore;
		} else this.#$nameLock = !!set;
		return this;
	}

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		if (json?.name && typeof json.name !== 'string') return;
		if (json?.$name && typeof json.$name !== 'string') return;
        return super.fromJSON(context, json, (instance) => {
			instance.name(json.name);
			instance.$diffTagHydrate(json.$name, ($name) => instance.name($name));
			callback?.(instance);
		});
    }

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, this.diffMergeJsons({
			name: this.#name,
			...jsonIn
		}, {
			name: this.#$name,
		}, options));
	}
}
