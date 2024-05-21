import Lexer from '../Lexer.js';

export default class Node {
	
	/**
	 * Instance properties
	 */
	CONTEXT;
	FLAGS = [];

	/**
	 * Constructor
	 */
	constructor(context) {
		this.CONTEXT = context;
		let statementNode = this.statementNode;
		if (statementNode === this) {
			// Subquery case
			statementNode = statementNode.CONTEXT?.statementNode;
		}
		statementNode?.connectedNodeCallback?.(this);
	}
	
	/**
	 * Recursively accesses @params.
	 * 
	 * @returns String
	 */
	get params() { return this.CONTEXT?.params || {}; }

	/**
	 * -----------
	 * NODE TREE
	 * -----------
	 */

	/**
	 * @property Node
	 */
	get rootNode() { return this.CONTEXT && this.CONTEXT instanceof Node ? this.CONTEXT.rootNode : this; }

	/**
	 * @property Node
	 */
	get statementNode() { return this.CONTEXT && this.CONTEXT instanceof Node ? this.CONTEXT.statementNode : this; }

	/**
	 * -----------
	 * QUOTES and ESCAPING
	 * -----------
	 */
	
	/**
	 * Determines the proper quote characters for the active SQL dialect ascertained from context.
	 * 
	 * @param Node|AbstractClient context 
	 * 
	 * @returns Array
	 */
	static getQuoteChars(context, asInputDialect = false) {
		const dialect = (asInputDialect && context?.params?.inputDialect) || context?.params?.dialect;
		return dialect === 'mysql' && !context.params.ansiQuotes ? ['"', "'"] : ["'"];
	}

	/**
	 * @property Array
	 */
	get quoteChars() { return this.constructor.getQuoteChars(this); }

	/**
	 * Determines the proper escape character for the active SQL dialect ascertained from context.
	 * 
	 * @param Node|AbstractClient context 
	 * 
	 * @returns String
	 */
	static getEscChar(context, asInputDialect = false) {
		const dialect = (asInputDialect && context?.params?.inputDialect) || context?.params?.dialect;
		return dialect === 'mysql' && !context.params.ansiQuotes ? '`' : '"';
	}

	/**
	 * @property String
	 */
	get escChar() { return this.constructor.getEscChar(this); }

	/**
	 * @inheritdoc
	 */
	static autoUnesc(context, expr, asInputDialect = false) {
		const escChar = this.getEscChar(context, asInputDialect);
		return (expr || '').replace(new RegExp(escChar + escChar, 'g'), escChar);
	}
	
	/**
	 * @inheritdoc
	 */
	static parseIdent(context, expr, asInputDialect = false) {
		const escChar = this.getEscChar(context, asInputDialect);
		const parts = Lexer.split(expr, ['.']);
		const parses = parts.map(s => (new RegExp(`^(?:(\\*|[\\w]+)|(${ escChar })((?:\\2\\2|[^\\2])+)\\2)$`)).exec(s.trim())).filter(s => s);
		if (parses.length !== parts.length) return;
		const get = x => x?.[1] || this.autoUnesc(context, x?.[3]);
		return [get(parses.pop()), get(parses.pop())];
	}

	/**
	 * An Escape helper
	 * 
	 * @param String|Array string_s 
	 * 
	 * @returns String
	 */
	autoEsc(string_s) {
		const $strings = (Array.isArray(string_s) ? string_s : [string_s]).map(s => s && !/^(\*|[\w]+)$/.test(s) ? `${ this.escChar }${ s.replace(new RegExp(this.escChar, 'g'), this.escChar.repeat(2)) }${ this.escChar }` : s );
		return Array.isArray(string_s) ? $strings : $strings[0];
	}

	/**
	 * -----------
	 * QUERY BUILDER
	 * -----------
	 */

	/**
	 * Helper for adding additional attributes to the instance.
	 * 
	 * @params Object meta
	 * 
	 * @return this
	 */
	with(meta) {
		for (const attr in meta) { this[attr] = meta[attr]; }
		return this;
	}

	/**
	 * Helper for adding flags to the instance.
	 * 
	 * @params Array flags
	 * 
	 * @return this
	 */
	withFlag(...flags) {
		this.FLAGS.push(...flags.filter(f => f).map(flag => flag.toUpperCase()));
		return this;
	}

	/**
	 * Helper for inspecting flags on the instance.
	 * 
	 * @params String flag
	 * 
	 * @return Bool
	 */
	hasFlag(flag) { return this.FLAGS.includes(flag.toUpperCase()); }

	/**
	 * Helper for adding clauses to the instance.
	 * 
	 * @params String LIST
	 * @params Array args
	 * @params Node|Array Type
	 * @params String delegate
	 * 
	 * @return this
	 */
	build(attrName, args, Type, delegate) {
		const Types = Array.isArray(Type) ? Type : (Type ? [Type] : []);
		if (!Types.length) throw new Error(`At least one node type must be defined.`);
		// ---------
		const cast = arg => Types.reduce((prev, Type) => prev || (arg instanceof Type ? arg : Type.fromJson(this, arg)), null);
		const set = (...args) => {
			for (const arg of args) {
				if (Array.isArray(this[attrName])) this[attrName].push(arg);
				else this[attrName] = arg;
			}
		};
		// ---------
		// Handle direct child node and json cases
		if (args.length === 1 && typeof args[0] !== 'function') {
			const instance = cast(args[0]);
			if (instance) return set(instance);
		}
		// Handle delegation cases
		if (delegate) {
			if (Types.length !== 1) throw new Error(`To support argument delegation, number of node types must be 1.`);
			const instance = this[attrName] && !Array.isArray(this[attrName]) ? this[attrName] : new Types[0](this);
			set(instance);
			return instance[delegate](...args);
		}
		// Handle direct child callback cases
		for (let arg of args) {
			// Pass an instance into provided callback for manipulation
			if (typeof arg === 'function') {
				// Singleton and already instantiated?
				if (this[attrName] && !Array.isArray(this[attrName])) {
					arg(this[attrName]);
					continue;
				}
				// New instance and may be or not be singleton
				if (Types.length === 1) {
					const instance = new Types[0](this);
					set(instance);
					arg(instance);
					continue;
				}
				// Any!!!
				const router = methodName => (...args) => {
					const instance = Types.reduce((prev, Type) => prev || (Type.factoryMethods ? (methodName in Type.factoryMethods && Type.factoryMethods[methodName](this, ...args)) : (methodName in Type.prototype && new Type(this))), null);
					if (!instance) throw new Error(`Unknow method: ${ methodName }()`);
					set(instance);
					if (instance[methodName]) return instance[methodName](...args); // Foward the call
					for (const f of args) f(instance); // It's just magic method mode
				};
				arg(new Proxy({}, { get: (t, name) => router(name) }));
				continue;
			}
			// Attempt to cast to type
			const instance = cast(arg);
			if (instance) {
				set(instance);
				continue;
			}
			throw new Error(`Arguments must be of type ${ Types.map(Type => Type.name).join(', ') } or a JSON equivalent. Recieved: ${ typeof arg }`);
		}
	}

	/**
	 * Clones the instance.
	 */
	clone() { return this.constructor.fromJson(this.CONTEXT, this.toJson()); }
	
	/**
	 * -----------
	 * PARSING CONVERSIONS
	 * -----------
	 */
	
	/**
	 * SAttempts to parse a string into the class instance.
	 *
	 * @param Any context
	 * @param String expr
	 * @param Function parseCallback
	 *
	 * @return Node
	 */
	static parse(context, expr, parseCallback = null) {}

	/**
	 * Serializes the instance.
	 * 
	 * @returns String
	 */
	toString() { return this.stringify(); }
	
	/**
	 * Attempts to cast a string into the class instance.
	 *
	 * @param Any context
	 * @param Object json
	 *
	 * @return Node
	 */
	static fromJson(context, json) {}

	/**
	 * Cast the instance to a plain object.
	 * 
	 * @returns Object
	 */
	toJson() { return {}; }
}
