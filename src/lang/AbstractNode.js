import { _fromCamel } from '@webqit/util/str/index.js';
import { _isObject } from '@webqit/util/js/index.js';
import { Lexer } from './Lexer.js';

export class AbstractNode {

	#contextNode;
	#flags = [];
	#additionalDetails;

	constructor(contextNode) {
		this.#contextNode = contextNode;
		this.#additionalDetails = new Map;
	}

	static get NODE_NAME() { return _fromCamel(this.name, '_').toUpperCase(); }
	get NODE_NAME() { return this.constructor.NODE_NAME; }

	/**
	 * -----------
	 * NODE TREE
	 * -----------
	 */

	get baseClient() { return this.#contextNode?.baseClient || this.#contextNode; }

	get params() { return this.#contextNode?.params || {}; }

	get additionalDetails() { return this.#additionalDetails; }

	get rootNode() { return this.#contextNode?.contextNode || this; }

	get statementNode() { return this.#contextNode?.statementNode; }

	get contextNode() { return this.#contextNode; }


	capture(requestName) {
		if (arguments.length !== 1) throw new Error(`capture() expects exactly 1 parameter.`);
		return this.#contextNode?.$capture(requestName, this);
	}

	bubble(eventType) {
		if (arguments.length !== 1) throw new Error(`bubble() expects exactly 1 parameter.`);
		return this.#contextNode?.$bubble?.(eventType, this);
	}

	$capture(requestName, requestSource) {
		if (arguments.length !== 2) throw new Error(`$capture() expects exactly 2 parameters.`);
		return this.#contextNode?.$capture?.(requestName, requestSource);
	}

	$bubble(eventType, eventSource) {
		if (arguments.length !== 2) throw new Error(`$bubble() expects exactly 2 parameters.`);
		this.#contextNode?.$bubble?.(eventType, eventSource);
		if (eventSource === this && eventType === 'DISCONNECTED') { this.#contextNode = null; }
	}

	$castInputs(args, Type, slot, slotName, delegatesTo = null, dedupeCallback = null) {
		// --------------
		const Types = [].concat(Type || []);
		if (!Types.length) throw new Error(`At least one node type must be defined.`);
		if (delegatesTo && Types.length !== 1) throw new Error(`Only one Type expected for delegatable operations.`);
		const $ = { result: slot };
		// --------------
		const fromInstanceOrJson = arg => {
			let instance = Types.reduce((prev, Type) => prev || (arg instanceof Type && arg), null);
			if (instance) return instance;
			return Types.reduce((prev, Type) => prev || Type.fromJSON(this, arg), null);
		};
		const createFactoryMethodHandler = ({ returnPairs = false, autoThrow = false }) => {
			const fromFactoryMethod = (methodName, ...args) => Types.reduce((prev, Type) => prev || (() => {
				if (Type.expose) {
					const $methodName = Object.keys(Type.expose).find(k => k.split('|').includes(methodName));
					const instance = $methodName && Type.expose[$methodName](this, ...args);
					return instance && [instance, instance];
				}
				if (typeof Type.prototype[methodName] === 'function') {
					const instance = new Type(this);
					return [instance, instance[methodName](...args)];
				}
			})(), null);
			return new Proxy({}, {
				get: (t, methodName) => (...args) => {
					const resultPair = fromFactoryMethod(methodName, ...args);
					if (resultPair) {
						$.result = adoptNode($.result, resultPair[0]);
						return returnPairs ? resultPair : resultPair[1];
					} else if (autoThrow) throw new Error(`[${this.NODE_NAME}::${slotName}]: The ${methodName}(${args}) method is undefined in any of ${Types.map(Type => Type.name).join(', ')}.`);
				},
			});
		};
		const adoptNode = (slot, instance) => {
			instance?.bubble('CONNECTED');
			if (instance && typeof this.params.nodeCallback === 'function') {
				this.params.nodeCallback(instance);
			}
			if (Array.isArray(slot) && instance) {
				const duplicate = dedupeCallback?.(instance);
				if (duplicate) {
					duplicate.bubble('DISCONNECTED');
					return slot.map((node) => node === duplicate ? instance : node);
				}
				return slot.concat(instance);
			}
			if (slot && instance !== slot) slot.bubble('DISCONNECTED');
			return instance;
		};
		// --------------
		if (args.length === 1 && args[0] === undefined) {
			if (Array.isArray($.result)) throw new Error(`[${this.NODE_NAME}::${slotName}]: Cannot unset array property.`);
			return adoptNode($.result, undefined);
		}
		// --------------
		// Handle args
		const delegatables = new Set;
		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			// Function args
			if (typeof arg === 'function') {
				if (delegatesTo) delegatables.add(arg);
				else arg(createFactoryMethodHandler({ returnPairs: false, autoThrow: true }));
				continue;
			}
			// Instance of JSON hydration
			if ($.instance = fromInstanceOrJson(arg)) {
				$.result = adoptNode($.result, $.instance);
				continue;
			}
			// Object factories
			const $$ = {};
			if (_isObject(arg) && !arg.nodeName && ($$.keys = Object.keys(arg)).length) {
				const proxy = createFactoryMethodHandler({ returnPairs: true, autoThrow: !delegatesTo });
				let baseMethodName = $$.keys.shift(), $nextMethodName;
				let [instance, chainTarget] = proxy[baseMethodName](...[].concat(arg[baseMethodName])) || [];
				if (instance) {
					while ($nextMethodName = $$.keys.shift()) {
						const nextMethod = chainTarget?.[$nextMethodName];
						if (typeof nextMethod !== 'function') throw new Error(`[${this.NODE_NAME}::${slotName}][${i + 1}/${args.length}]: The implied chaining: ${chainTarget.NODE_NAME}.${baseMethodName}().${$nextMethodName}() is invalid.`);
						chainTarget = nextMethod.call(chainTarget, ...[].concat(arg[$nextMethodName]));
						baseMethodName = $nextMethodName;
					}
					continue;
				}
			}
			// Delegable?
			if (delegatesTo) {
				delegatables.add(arg);
				continue;
			}
			let content;
			if (_isObject(arg)) { try { content = JSON.stringify(arg); } catch (e) { content = arg.constructor.name; } }
			else content = arg + '';//typeof arg;
			throw new Error(`[${this.NODE_NAME}::${slotName}][${i + 1}/${args.length}]: Arguments must be of type ${Types.map(Type => Type.name).join(', ')} or a JSON equivalent. Recieved: ${content}`);
		}
		// --------------
		// Delegate arguments
		if (delegatables.size) {
			let instance;
			if (Array.isArray($.result)) {
				instance = new Types[0](this);
				$.result = adoptNode($.result, instance);
			} else {
				$.result = $.result || new Types[0](this);
				instance = $.result;
			}
			instance[delegatesTo](...delegatables);
			return $.result;
		}
		// --------------
		// Return result
		return $.result;
	}

	/**
	 * -----------
	 * ESCAPING & QUOTING
	 * -----------
	 */

	static getQuoteChars(contextNode, asInputDialect = false) {
		const dialect = (asInputDialect && contextNode?.params?.inputDialect) || contextNode?.params?.dialect;
		return dialect === 'mysql' && !contextNode.params.ansiQuotes ? ["'", '"'] : ["'"];
	}

	static getEscChar(contextNode, asInputDialect = false) {
		const dialect = (asInputDialect && contextNode?.params?.inputDialect) || contextNode?.params?.dialect;
		return dialect === 'mysql' && !contextNode.params.ansiQuotes ? '`' : '"';
	}

	get quoteChars() { return this.constructor.getQuoteChars(this); }

	get escChar() { return this.constructor.getEscChar(this); }

	static esc(escChar, expr, quote = false) { return quote || !/^(\*|[\w]+)$/.test(expr)/*not alphanumeric*/ ? `${escChar}${(expr || '').replace(new RegExp(escChar, 'g'), escChar.repeat(2))}${escChar}` : expr; }

	static unesc(escChar, expr, unquote = false) { return (!unquote || (new RegExp(`^${escChar}.*${escChar}$`)).test(expr) && (expr = expr.slice(1, -1))) && expr.replace(new RegExp(escChar.repeat(2), 'g'), escChar); }

	static parseIdent(contextNode, expr, unquote = false, asInputDialect = true) {
		const escChar = this.getEscChar(contextNode, asInputDialect);
		const parts = Lexer.split(expr, ['.']);
		const parses = parts.map(s => (new RegExp(`^(?:(\\*|[\\w]+)|(${escChar})((?:\\2\\2|[^\\2])+)\\2)$`)).exec(s.trim())).filter(s => s);
		return parses.length < parts.length ? [] : parses.map(s => s?.[1] || this.unesc(escChar, s?.[3], unquote));
	}

	stringifyIdent(ident_s, quote = false) {
		const esc = ident => this.constructor.esc(this.escChar, ident, quote);
		if (Array.isArray(ident_s)) return ident_s.filter(s => s).map(esc).join('.');
		return esc(ident_s);
	}

	static parseString(contextNode, expr, unquote = false, asInputDialect = true) {
		const quoteChars = this.getQuoteChars(contextNode, asInputDialect), $ = {};
		while (($.quoteChar = quoteChars.pop()) && ($.resultString = this.unesc($.quoteChar, expr, unquote)) !== false) {
			return [$.resultString, $.quoteChar];
		}
		return [];
	}

	stringifyString(str, quote = false) { return this.constructor.esc(this.quoteChars[0], str, quote); }

	/**
	 * -----------
	 * PARSING CONVERSIONS
	 * -----------
	 */

	withDetail(key, value) {
		this.#additionalDetails.set(key, value);
		return this;
	}

	hasDetail(key) { return this.#additionalDetails.has(key); }

	getDetail(key) { return this.#additionalDetails.get(key); }

	withFlag(...flags) {
		flags = new Set(flags.filter(f => f));
		this.#flags = this.#flags.reduce(($flags, $flag) => {
			const a = $flag.split(':');
			for (const flag of flags) {
				const b = flag.split(':');
				if (b[0] === a[0]) {
					$flag = [...(new Set([...a, ...b]))].join(':');
					flags.delete(flag);
				}
			}
			return $flags.concat($flag);
		}, []).concat(...flags);
		return this;
	}

	hasFlag(flag) { return !!this.getFlag(flag); }

	getFlag(flag) {
		if (!arguments.length) return this.#flags;
		const b = flag.toUpperCase().split(':');
		return this.#flags.find($flag => {
			const a = $flag.split(':');
			return b[0] === a[0] && b.every(f => a.includes(f));
		});
	}

	$eq(a, b, caseMatch = null) {
		if (Array.isArray(a) && Array.isArray(b)) {
			return a.length === b.length && (b = b.slice(0).sort())
			&& a.slice(0).sort().every((x, i) => this.$eq(x, b[i], caseMatch));
		}
		if (a instanceof AbstractNode) a = a.jsonfy();
		if (b instanceof AbstractNode) b = b.jsonfy();
		if (_isObject(a) && _isObject(b)) {
			const temp = {};
			return (temp.keys_a = Object.keys(a)).length === (temp.keys_b = Object.keys(b)).length
			&& temp.keys_a.reduce((prev, k) => prev && this.$eq(a[k], b[k], caseMatch), true);
		}
		if (typeof a === 'string' && typeof b === 'string' && caseMatch === 'ci') {
			return a.toLowerCase() === b.toLowerCase();
		}
		return a === b;
	}

	identifiesAs(value) {
		if (typeof value === 'undefined') return false;
		if (typeof value?.toJSON === 'function') return this.$eq(this.jsonfy(), value.jsonfy(), 'ci');
	}

	contains(possibleChild) {
		if (!possibleChild) return false;
		return this === possibleChild.contextNode || this.contains(possibleChild.contextNode);
	}

	static fromJSON(contextNode, json, callback = null) {
		if (json instanceof AbstractNode) throw new Error(`Illegal instance passed as JSON: ${json.NODE_NAME}`);
		if (_isObject(json) && 'nodeName' in json && json.nodeName !== this.NODE_NAME) return;
		const instance = (new this(contextNode)).withFlag(...(json?.flags || []));
		if (typeof callback === 'function') callback(instance);
		return instance;
	}

	jsonfy(options = {}, jsonIn = {}) {
		return {
			...(options.nodeNames !== false ? { nodeName: this.NODE_NAME } : {}),
			...(typeof jsonIn === 'function' ? jsonIn() : jsonIn),
			...(this.#flags.length ? { flags: this.#flags.slice(0) } : {}),
		};
	}

	static parse(contextNode, expr, parseCallback = null) { }

	toString() { return this.stringify(); }

	toJSON(keyHint = null, options = {}) { return this.jsonfy(options); }

	clone(options = {}) {
		const json = this.jsonfy(options);
		const Classes = [this.constructor].concat(this.constructor.DESUGARS_TO || []);
		return Classes.reduce((prev, C) => prev || C.fromJSON(this.#contextNode, json), undefined);
	}

	deSugar(options = {}) {
		options = { ...options, deSugar: true };
		return this.clone(options);
	}
}
