
import Node from '../../abstracts/Node.js';
import { _fromCamel } from '@webqit/util/str/index.js';

export default class AbstractNode extends Node {

    /**
	 * Instance properties
	 */
	NAME;
	$NAME;
	STATUS;

    /**
	 * @var String
	 */
    static get TYPE() { return _fromCamel(this.name.replace(/\d/g, ''), '_').toUpperCase(); }

    /**
	 * @var String
	 */
	get TYPE() { return this.constructor.TYPE; }

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

	/**
	 * Returns the right prop name depending on status.
	 * 
	 * @param String key
	 * @param Bool isWrite
	 * 
	 * @returns String
	 */
	smartKey(key, isWrite = false) {
		if (this.status() === 'UP') return isWrite || isDirty(this[`$${ key }`]) ? `$${ key }` : key;
		if (this.status() === 'DOWN') {
			const type = this.TYPE instanceof Node ? this.constructor.TYPE : this.TYPE;
			if (isWrite) throw new Error(`Cannot alter ${ type } after having been dropped.`);
			return key;
		}
		return key;
	}

	/**
	 * Invokes a callback that sets a prop while properly managing status.
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
				if (this.status() === 'DOWN') {
					const type = this.TYPE instanceof Node ? this.constructor.TYPE : this.TYPE;
					throw new Error(`Diffing cannot be done on a node ${ type } after having been dropped.`)
				} else if (!this.status()) this.status('UP');
				return callback(value);
			};
			// Start from up the context?
			if (typeof this.CONTEXT?.hardSet === 'function') {
				return this.CONTEXT.hardSet(value, pass);
			}
			if (isDirty(value)) return pass();
			return;
		}
		const statusBefore = this.STATUS;
		this.STATUS = null;
		const returnValue = callback();
		this.STATUS = statusBefore;
		return returnValue;
	}
    
	/**
	 * Gets/sets the status.
     * 
	 * @param String value
	 * 
	 * @return this
	 */
	status(value, recursively = false) {
        if (!arguments.length) return this.STATUS;
        if (value && !['UP','DOWN'].includes(value)) throw new Error(`Status can only be "UP" or "DOWN". Received: ${ value }`);
        this.STATUS = value;
		if (recursively) {
            for (const node of this.SUBTREE_PROPS.reduce((entries, key) => [...entries, ...this[key]], [])) {
                if (value !== 'UP') node.status(undefined, true); // A DOWN or (NEW) status means nested nodes should be undefined
                else node.status(node.status() || (typeof recursively === 'string' ?/* means: force to state; typical UP and for describes */ recursively : undefined), recursively);
            }
        }
        return this;
    }

	/**
	 * @returns this
	 */
	drop() { return this.status('DOWN'); }

	/**
	 * @returns Boolean
	 */
	dropped() { return this.status() === 'DOWN' || this.CONTEXT?.dropped?.(); }

	/**
	 * Rollback status
	 */
	reverseAlt(recursively = false) {
		if (this.status() === 'UP') {
			for (const prop of this.WRITABLE_PROPS) {
				if (isDirty(this[`$${ prop }`])) {
					const normalValue = this[prop];
					this[prop] = this[`$${ prop }`];
					this[`$${ prop }`] = normalValue;
				}
			}
		} else if (this.status() === 'DOWN') this.status(undefined);
		else if (!this.status()) this.status('DOWN');
		if (recursively) {
			for (const node of this.SUBTREE_PROPS.reduce((entries, key) => [...entries, ...this[key]], [])) {
				node.reverseAlt(recursively);
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			...(this.NAME ? { name: this.NAME } : {}),
			...(this.$NAME ? { $name: this.$NAME } : {}),
			...(this.STATUS ? { status: this.STATUS } : {}),
			...(this.FLAGS.length ? { flags: [ ...this.FLAGS ] } : {}),
		};
	}

    /**
	 * @inheritdoc
	 */
    static fromJson(context, json, callback = null) {
        if ((json?.name && typeof json.name !== 'string') || (json.$name && typeof json.$name !== 'string')) return;
        const instance = callback ? callback() : new this(context);
        instance.hardSet(() => instance.name(json.name));
		instance.hardSet(json.$name, val => instance.name(val));
        if (json.status) instance.status(json.status);
        if (json.flags) instance.withFlag(...json.flags);
        return instance;
    }
}

// Has any value? Arrays and objects (not empty), number (including 0), string (not empty), boolean (true/false)
const isDirty = value => Array.isArray(value) ? value.length : (typeof value === 'object' && value ? Object.keys(value).length : ![undefined, null, ''].includes(value));