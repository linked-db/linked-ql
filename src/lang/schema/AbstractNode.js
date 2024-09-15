import AbstractNode1 from '../AbstractNode.js';

export default class AbstractNode extends AbstractNode1 {

    /**
	 * Instance properties
	 */
	NAME;
	$NAME;
	KEEP;

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['NAME']; }
    static get SUBTREE_PROPS() { return []; }

	/**
	 * @var Array
	 */
	get WRITABLE_PROPS() { return this.constructor.WRITABLE_PROPS; }
	get SUBTREE_PROPS() { return this.constructor.SUBTREE_PROPS; }

	/**
	 * Returns name or sets name
	 * 
	 * @param Void|String name
	 * 
	 * @returns String
	 */
	name(name) {
		if (!arguments.length) return this[this.smartKey('NAME')];
        return (this[this.smartKey('NAME', true)] = name, this);
	}

    diffWith(nodeB) {
		if (typeof nodeB.keep() === 'boolean') this.keep(nodeB.keep());
        if (!this.isSame(nodeB.name(), this.name(), 'ci')) { this.name(nodeB.name()); }
    }

	/**
	 * Returns the right prop name depending on "keep".
	 * 
	 * @param String key
	 * @param Bool isWrite
	 * 
	 * @returns String
	 */
	smartKey(key, isWrite = false) {
		if (this.keep() === true) return isWrite || isDirty(this[`$${ key }`]) ? `$${ key }` : key;
		if (this.keep() === false) {
			if (isWrite) throw new Error(`Cannot alter ${ this.constructor.name } after having been dropped.`);
			return key;
		}
		return key;
	}

	/**
	 * Invokes a callback that sets a prop while properly managing "keep".
	 * 
	 * @param Function callback
	 * 
	 * OR
     * 
	 * @param Any value
	 * @param Function callback
	 * 
	 * @return this
	 */
	hardSet(...args) {
		const callback = args.pop();
		if (args.length) {
			const value = args[0];
			const pass = () => {
				if (this.keep() === false) {
					throw new Error(`Diffing cannot be done on a node ${ this.constructor.name } after having been dropped.`)
				} else if (typeof this.keep() !== 'boolean') this.keep(true);
				return callback(value);
			};
			// Start from up the context?
			if (typeof this.CONTEXT?.hardSet === 'function') {
				return this.CONTEXT.hardSet(value, pass);
			}
			if (isDirty(value)) return pass();
			return;
		}
		const keepBefore = this.KEEP;
		this.KEEP = null;
		const returnValue = callback();
		this.KEEP = keepBefore;
		return returnValue;
	}
    
	/**
	 * Gets/sets the "keep".
     * 
	 * @param String value
	 * 
	 * @return this
	 */
	keep(value, recursively = false) {
        if (!arguments.length) return this.KEEP;
        if (![undefined,true,false].includes(value)) throw new Error(`Status can only be true, false, or undefined. Received: ${ value }`);
        this.KEEP = value;
		if (recursively) {
            for (const node of this.SUBTREE_PROPS.reduce((entries, key) => [...entries, ...this[key]], [])) {
                if (value !== true) node.keep(undefined, true); // A false or (undefined) "keep" means nested nodes should be undefined
                else node.keep(recursively === 'auto' ? node.keep() : true, recursively);
            }
        }
        return this;
    }

	/**
	 * @returns this
	 */
	drop() { return this.keep(false); }

	/**
	 * @returns Boolean
	 */
	dropped() { return this.keep() === false || this.CONTEXT?.dropped?.(); }

	/**
	 * Commits all alterations and resets the "keep" flag
	 * 
	 * @param Bool recursively
	 * 
	 * @returns Void
	 */
	commitAlt(recursively = false) {
		this.keep(undefined);
		for (const prop of this.WRITABLE_PROPS) {
			if (isDirty(this[`$${ prop }`])) {
				this[prop] = this[`$${ prop }`];
				this[`$${ prop }`] = Array.isArray(this[`$${ prop }`]) ? [] : undefined;
			}
		}
		if (!recursively) return;
		for (const node of this.SUBTREE_PROPS.reduce((entries, key) => [...entries, ...this[key]], [])) {
			node.commitAlt(recursively);
		}
	}

	/**
	 * Reverses all alterations and the "keep" flag
	 * 
	 * @param Bool recursively
	 * 
	 * @returns Void
	 */
	reverseAlt(recursively = false) {
		if (this.keep() === true) {
			for (const prop of this.WRITABLE_PROPS) {
				if (isDirty(this[`$${ prop }`])) {
					const normalValue = this[prop];
					this[prop] = this[`$${ prop }`];
					this[`$${ prop }`] = normalValue;
				}
			}
		} else if (this.keep() === false) this.keep(undefined);
		else if (typeof this.keep() !== 'boolean') this.keep(false);
		if (!recursively) return;
		for (const node of this.SUBTREE_PROPS.reduce((entries, key) => [...entries, ...this[key]], [])) {
			node.reverseAlt(recursively);
		}
	}
	
	/**
	 * 
	 * @param Any a 
	 * @param Any b 
	 * @returns 
	 */
	isSame(a, b, caseMatch = null) {
		if (typeof a === 'string' && typeof b === 'string' && caseMatch === 'ci') {
			return a.toLowerCase() === b.toLowerCase();
		}
		if (a === b) return true;
		if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
			const $b = b.slice(0).sort();
			return a.slice(0).sort().every((x, i) => this.isSame(x, $b[i], caseMatch));
		}
		const temp = {};
		if (typeof a === 'object' && a && typeof b === 'object' && b && (temp.keys_a = Object.keys(a)).length === (temp.keys_b = Object.keys(b)).length) {
			return temp.keys_a.reduce((prev, k) => prev && this.isSame(a[k], b[k], caseMatch), true);
		}
		return false;
	}

	toJSON(json = {}) {
		return {
			...(this.NAME ? { name: this.NAME } : {}),
			...(this.$NAME ? { $name: this.$NAME } : {}),
			...json,
			...(typeof this.KEEP === 'boolean' ? { keep: this.KEEP } : {}),
			...(this.FLAGS.length ? { flags: [ ...this.FLAGS ] } : {}),
		};
	}

    static fromJSON(context, json, callback = null) {
        if ((json?.name && typeof json.name !== 'string') || (json.$name && typeof json.$name !== 'string')) return;
        const instance = callback ? callback() : new this(context);
        instance.hardSet(() => instance.name(json.name));
		instance.hardSet(json.$name, val => instance.name(val));
        if (typeof json.keep === 'boolean') instance.keep(json.keep);
        if (json.flags) instance.withFlag(...json.flags);
        return instance;
    }
}

// Has any value? Arrays and objects (not empty), number (including 0), string (not empty), boolean (true/false)
const isDirty = value => Array.isArray(value) ? value.length : (typeof value === 'object' && value ? Object.keys(value).length : ![undefined, null, ''].includes(value));