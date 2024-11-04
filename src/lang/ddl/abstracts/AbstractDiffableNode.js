import { _isObject } from '@webqit/util/js/index.js';
import { AbstractNode } from '../../AbstractNode.js';

export class AbstractDiffableNode extends AbstractNode {

	#status;
	#CDLIgnoreList = [];

	status() { return this.#status || 'existing'; }

	CDLIgnoreList() { return this.#CDLIgnoreList.slice(); }

	alterWith(nodeCDL, options = {}) {
		return this.constructor.fromJSON(this, this.renderCDL(nodeCDL, options));
	}

	diffWith(nodeB, options = {}) {
		return this.constructor.fromJSON(this, this.generateDiff(nodeB, options));
	}

	dirtyCheck(deeply = false) {
		return ['new', 'obsolete'].includes(this.#status) ? ['status'] : [];
	}

	dirtyCheckProperties(props) {
		return props.filter(p => !this.$eq(this[p](), this[`$${p}`](), 'ci'));
	}

	diffMergeJsons(jsonA, jsonB, options) {
		for (const k of Object.keys(jsonB)) {
			if (['nodeName', 'flags', 'CDLIgnoreList', 'status'].includes(k)) continue;
			if (!this.$isDirty(jsonB[k]) || this.$eq(jsonA[k], jsonB[k], 'ci')) continue;
			if (options.diff === 'reverse') {
				if (options.honourCDLIgnoreList && jsonA.CDLIgnoreList?.includes(k)) continue;
				jsonA = { ...jsonA, [k]: jsonB[k], [`$${k}`]: jsonA[k] };
			} else {
				jsonA = { ...jsonA, [options.diff === false ? k : `$${k}`]: jsonB[k] };
			}
		}
		return jsonA;
	}

	diffMergeTrees(treeA, treeB, existingCallback, options) {
		if (Array.isArray(treeA)) {
			treeA = new Map(treeA.map(node => [node.name().toLowerCase(), node]));
			treeB = new Map(treeB.map(node => [node.name().toLowerCase(), node]));
		}
		const [dropped, existing, added] = [new Set, new Set, new Set];
		for (const name of new Set([...treeA.keys(), ...treeB.keys()])) {
			if (!treeB.has(name) && treeA.has(name)) dropped.add(treeA.get(name));
			else if (treeB.has(name) && !treeA.has(name)) added.add(treeB.get(name));
			else existing.add(treeA.get(name));
		}
		return [...treeA.entries()].reduce((jsons, [name, node]) => {
			if (dropped.has(node)) return jsons.concat({ ...node.jsonfy(options), status: 'obsolete' });
			if (existing.has(node)) {
				const subDiff = existingCallback(node, treeB.get(name));
				// Should we be in subtractive diffing mode
				if (!Object.keys(subDiff).length) return jsons;
				return jsons.concat(subDiff);
			}
			return jsons;
		}, []).concat([...added].map(
			node => ({ ...node.jsonfy(options), status: 'new' })
		));
	}

	reverseDiff(options = {}) {
		return this.constructor.fromJSON(
			this.contextNode,
			this.jsonfy({ ...options, diff: 'reverse' })
		);
	}

	/* -- MODES */

	#$diffTagHydrate = false;
	$diffTagHydrate(...args) {
		if (!arguments.length) return this.#$diffTagHydrate;
		if (this.$isDirty(args[0])) {
			const settingBefore = this.#$diffTagHydrate;
			this.#$diffTagHydrate = true;
			args[1](args[0]);
			this.#$diffTagHydrate = settingBefore;
		}
		return this;
	}

	$isDirty(value) { return Array.isArray(value) ? !!value.length : typeof value !== 'undefined'; }

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			instance.#status = json.status;
			if (Array.isArray(json.CDLIgnoreList)) {
				instance.#CDLIgnoreList.push(...json.CDLIgnoreList);
			}
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			...jsonIn,
			...(this.#status && options.diff !== false ? { status: options.diff === 'reverse' && ['new', 'obsolete'].includes(this.#status) ? (this.#status === 'new' ? 'obsolete' : 'new') : this.#status } : {}),
			...(this.#CDLIgnoreList.length && options.diff !== false ? { CDLIgnoreList: this.#CDLIgnoreList.slice() } : {}),
		});
	}
}
