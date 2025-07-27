import { _isObject } from '@webqit/util/js/index.js';
import { _eq, _toCapsSnake } from '../util.js';
import { TokenStream } from '../TokenStream.js';
import { TOK_TYPES } from '../toktypes.js';
import { registry } from '../registry.js';

/**
 * parse(str, { ... })|fromJSON(json, {
 *   dialect,
 * 	 mysqlAnsiQuotes
 *   mysqlNoBackslashEscapes,
 *   assert
 * })
 * 
 * stringify({
 *   prettyPrint,
 * 	 startingIndentLevel,
 *   autoLineBreakThreshold,
 *   pruneOptionalParens,
 *   tabSpaces
 * })
 * 
 * jsonfy({
 *   nodeNames,
 *   toDialect,
 *   deSugar,
 *   reverseRef,
 *   fullyQualified,
 * })
 */

export class AbstractNode {

	static get NODE_NAME() { return _toCapsSnake(this.name); }
	get NODE_NAME() { return this.constructor.NODE_NAME; }

	#ast;
	#options;
	#astSchema;

	constructor(ast = {}, options = {}) {
		this.#ast = ast;
		this.#options = options;
		this.#astSchema = this.constructor.compileASTSchemaFromSyntaxRules(this.options);
		for (const node_s of Object.values(this.#ast)) {
			this._adoptNodes(...[].concat(node_s));
		}
	}

	#contextNode;

	get contextNode() { return this.#contextNode; }

	get statementNode() { return this.#contextNode?.statementNode; }

	get rootNode() { return this.#contextNode?.rootNode || this; }

	get options() { return this.#options; }

	/**
	 * -----------
	 * AST API
	 * -----------
	 */

	get _astSchema() { return this.#ast; }

	_fieldSchema(fieldName, index = undefined) {
		const fieldSchema = this.#astSchema[fieldName] || {};
		if (typeof index !== 'undefined') {
			const activeTrailStr = `${this.NODE_NAME}.<${fieldName}>.<${index}>`;
			if ([undefined, null].includes(fieldSchema.arity)) {
				throw new Error(`[${activeTrailStr}] Can't use index on "${fieldName}". Not index-based.`);
			}
			if (!fieldSchema.keyed && typeof index !== 'number') {
				throw new Error(`[${activeTrailStr}] Can't use non-numeric index on "${fieldName}". Not keyed.`);
			}
		}
		return fieldSchema;
	}

	_set(fieldName, indexOrValue, valueOnIndex = undefined) {
		const index = arguments.length > 2 ? indexOrValue : undefined;
		const value = arguments.length > 2 ? valueOnIndex : indexOrValue;
		const fieldSchema = this._fieldSchema(fieldName, index);
		const existing = this._get(fieldName, index);
		const activeTrailStr = `${this.NODE_NAME}.<${fieldName}>`;
		if (existing) {
			this._unadoptNodes(...[].concat(existing));
		}
		if (typeof index !== 'undefined') {
			this.#ast[fieldName] = !existing ? this.#ast[fieldName].concat(value) : this.#ast[fieldName].reduce((all, n) => {
				if (n === existing) return all;
				return all.concat(n);
			}, []);
		} else {
			if (![undefined, null].includes(fieldSchema.arity)) {
				if (!Array.isArray(value)) {
					throw new Error(`[${activeTrailStr}] Invalid "${fieldName}" type provided. Array expected.`);
				}
				if (fieldSchema.arity !== Infinity) {
					const count = value.length;
					if (_isObject(fieldSchema.arity)) {
						if ('min' in fieldSchema.arity && count < fieldSchema.arity.min) {
							throw new Error(`[${activeTrailStr}] A minimum of ${fieldSchema.arity.min} argument(s) expected but got ${count}.`);
						}
						if ('max' in fieldSchema.arity && count > fieldSchema.arity.max) {
							throw new Error(`[${activeTrailStr}] A maximum of ${fieldSchema.arity.max} argument(s) expected but got ${count}.`);
						}
					} else if (![].concat(fieldSchema.arity).includes(count)) {
						throw new Error(`[${activeTrailStr}] Exactly ${[].concat(fieldSchema.arity).join(' or ')} argument(s) expected but got ${count}.`);
					}
				}
			}
			this.#ast[fieldName] = value;
		}
		this._adoptNodes(...[].concat(value));
		return true;
	}

	_get(fieldName, index = undefined) {
		//const fieldSchema = this._fieldSchema(fieldName, index); TODO
		if (fieldName in this.#ast) {
			// Return value, optionally deeply
			let value = this.#ast[fieldName];
			if (typeof index === 'number') {
				value = value[index];
			} else if (index) {
				value = value.find((n) => n.identifiesAs?.(index));
			}
			return value;
		}
		if (typeof index === 'undefined') {
			// Return default
			//return ![undefined, null].includes(fieldSchema.arity) ? [] : fieldSchema.default;
		}
	}

	_delete(fieldName, index = undefined) {
		this._fieldSchema(fieldName, index);
		if (!(fieldName in this.#ast)) return false;
		if (typeof index !== 'undefined') {
			this.#ast[fieldName] = this.#ast[fieldName].reduce((all, n, i) => {
				const matches = typeof index === 'number'
					? i === index
					: n.identifiesAs?.(index);
				if (matches) {
					this._unadoptNodes(n);
					return all;
				}
				return all.concat(n);
			}, []);
		} else {
			this._unadoptNodes(...[].concat(this.#ast[fieldName]));
			this.#ast[fieldName] = this._default(fieldName);
		}
		return true;
	}

	_has(fieldName, index = undefined) {
		this._fieldSchema(fieldName, index);
		if (fieldName in this.#ast) {
			if (typeof index === 'number') {
				return typeof this.#ast[fieldName][index] !== 'undefined';
			}
			if (index) {
				return this.#ast[fieldName].some((n) => n.identifiesAs?.(index));
			}
			return true;
		}
		return false;
	}

	_add(fieldName, ...args) {
		const fieldSchema = this._fieldSchema(fieldName);
		if ([undefined, null].includes(fieldSchema.arity)) {
			const activeTrailStr = `${this.NODE_NAME}.<${fieldName}>`;
			throw new Error(`[${activeTrailStr}] Can't perform add() on "${fieldName}". Not item-based.`);
		}
		this._adoptNodes(...args);
		this.#ast[fieldName] = this.#ast[fieldName].concat(args);
		return true;
	}

	_adoptNodes(...nodes) {
		for (const node of nodes) {
			if (!(node instanceof AbstractNode)) continue;
			if (node.#contextNode && node.#contextNode !== this) {
				const activeTrailStr = `${this.NODE_NAME}`;
				throw new Error(`[${activeTrailStr}] Illegal node operation`);
			}
			node.#contextNode = this;
		}
	}

	_unadoptNodes(...nodes) {
		for (const node of nodes) {
			if (!(node instanceof AbstractNode)) continue;
			if (node.#contextNode !== this) {
				const activeTrailStr = `${this.NODE_NAME}`;
				throw new Error(`[${activeTrailStr}] Illegal node operation`);
			}
			node.#contextNode = null;
		}
	}

	_walk(visitor) {
		for (const value of Object.values(this.#ast)) {
			for (const possibleNode of [].concat(value)) {
				if (possibleNode?._walk) possibleNode._walk(visitor);
			}
		}
		if (visitor?.visit) {
			return visitor.visit(this);
		}
		if (typeof visitor === 'function') {
			return visitor(this);
		}
	}

	/**
	 * -----------
	 * CONTEXT API
	 * -----------
	 */

	_capture(requestName, requestSource) {
		if (arguments.length !== 2) {
			throw new Error(`_capture() expects exactly 2 parameters.`);
		}
		return this.#contextNode?._capture?.(requestName, requestSource);
	}

	capture(requestName) {
		if (arguments.length !== 1) {
			throw new Error(`capture() expects exactly 1 parameter.`);
		}
		return this.#contextNode?._capture(requestName, this);
	}

	_bubble(eventType, eventSource) {
		if (arguments.length !== 2) {
			throw new Error(`_bubble() expects exactly 2 parameters.`);
		}
		this.#contextNode?._bubble?.(eventType, eventSource);
		if (eventSource === this && eventType === 'DISCONNECTED') { this.#contextNode = null; }
	}

	bubble(eventType) {
		if (arguments.length !== 1) {
			throw new Error(`bubble() expects exactly 1 parameter.`);
		}
		return this.#contextNode?._bubble?.(eventType, this);
	}

	containsNode(possibleChild) {
		if (!possibleChild) return false;
		return this === possibleChild.contextNode || this.containsNode(possibleChild.contextNode);
	}

	identifiesAs(value) {
		if (typeof value === 'undefined') return false;
		if (typeof value?.toJSON === 'function') return _eq(this.jsonfy(), value.jsonfy(), 'ci');
	}

	/**
	 * -----------
	 * TRANSFORMATION API
	 * -----------
	 */

	static morphsTo() { return this; }

	deSugar(options = {}) {
		options = { ...options, deSugar: true };
		return this.clone(options);
	}

	toDialect(dialect, options = {}) {
		options = { ...options, toDialect: dialect };
		return this.clone(options);
	}

	clone(options = {}) {
		const resultJson = this.jsonfy(options);
		const Classes = [].concat(this.constructor.morphsTo());
		return Classes.reduce((prev, C) => prev || C.fromJSON(resultJson, { dialect: options.toDialect || this.options.dialect }), undefined);
	}

	/**
	 * -----------
	 * JSON API
	 * -----------
	 */

	static get syntaxRules() { return []; }

	static compileASTSchemaFromSyntaxRules({ dialect = 'postgres' } = {}) {
		if (!this._astSchemaCompileCache) {
			this._astSchemaCompileCache = new Map;
		}
		const cacheKey = `${this.NODE_NAME}:${dialect}`;
		if (!this._astSchemaCompileCache.has(cacheKey)) {
			let result, syntaxRules = this.syntaxRules, rulesArray = [].concat(syntaxRules);
			if (rulesArray.length === 1 && Array.isArray(rulesArray[0].type) && !rulesArray[0].as) {
				result = rulesArray[0];
			} else {
				result = this._compileASTSchemaFromSyntaxRules(syntaxRules, dialect, { trail: [this.NODE_NAME] });
			}
			this._astSchemaCompileCache.set(cacheKey, result);
		}
		return this._astSchemaCompileCache.get(cacheKey);
	}

	static _compileASTSchemaFromSyntaxRules(syntaxRules, dialect = 'postgres', { trail = [], schemaSet = new Set([new Map]), assertionTrail = { dependencies: new Set, optional: false, assert: false } } = {}) {
		const rulesArray = Array.isArray(syntaxRules) ? syntaxRules : [syntaxRules];
		const newDependencyTrail = new Set(assertionTrail.dependencies);
		const cloneSchemaSet = (schemaSet) => new Set([...schemaSet].map((sch) => new Map(sch)));
		for (const [i, rule] of rulesArray.entries()) {
			if (rule.dialect && rule.dialect !== dialect) {
				continue;
			}
			const {
				type,
				as: exposure,
				if: inference = assertionTrail.inference,
				value,
				arity,
				modifier,
				booleanfy,
				optional = assertionTrail.optional,
				assert = assertionTrail.assert,
				syntax,
				syntaxes,
				...rest
			} = rule;
			const activeTrail = trail.concat(`${Array.isArray(syntaxRules) ? i : ''}${exposure ? `<${exposure}>` : ''}` || []);
			const activeTrailStr = activeTrail.join('.');
			const unsupportedAttrs = _getUnsupportedRuleAttrs(rest);
			if (unsupportedAttrs.length) {
				throw new Error(`[${activeTrailStr}] Unsupported attributes in rule: "${unsupportedAttrs.join('", "')}".`);
			}
			const isTokenRule = typeof type === 'string' && type[0] === type[0].toLowerCase();
			if (exposure) {
				// 1. Validate rule
				if (!type) throw new Error(`[${activeTrailStr}] Field rules must have a "type" attribute of type string.`);
				if (syntax || syntaxes) throw new Error(`[${activeTrailStr}] Field rules ("${exposure}") can not have a "syntax" or "syntaxes" attribute.`);
				if (exposure === '.') {
					if (!isTokenRule) throw new Error(`[${activeTrailStr}] Terminal Node rules must be token-typed rules.`);
					if (optional) throw new Error(`[${activeTrailStr}] Terminal Node rules can not be optional.`);
				} else {
					if (modifier) throw new Error(`[${activeTrailStr}] Only Terminal Node rules can have a "modifier" attribute.`);
				}
				if (isTokenRule) {
					if (![undefined, null].includes(arity)) throw new Error(`[${activeTrailStr}] Token rules can not be item-based.`);
					if (!TOK_TYPES[type]) throw new Error(`[${activeTrailStr}] Unknown token type "${type}".`);
				} else {
					if (value) throw new Error(`[${activeTrailStr}] Only token rules can have a "value" attribute.`);
					for (const t of [].concat(type)) {
						if (!registry[t]) throw new Error(`[${activeTrailStr}] Unknown node type "${t}".`);
					}
					if (![undefined, null].includes(arity)) {
						if (_isObject(arity)) {
							const keys = Object.keys(arity);
							if (keys.some((k) => !['min', 'max', 'eager'].includes(k) || (typeof arity[k] !== (k === 'eager' ? 'boolean' : 'number')))) {
								throw new Error(`Invalid arity object "{ ${keys.join(', ')} }" for field "${exposure}". Only "min: <number>", "max: <number>" and "eager: <bool>" expected.`);
							}
						} else if ([].concat(arity).some((a) => typeof a !== 'number')) {
							throw new Error(`[${activeTrailStr}] Invalid arity value "${[].concat(arity).join(', ')}" for field "${exposure}". Number(s) expected.`);
						}
					}
				}
				// 2. Compose schema
				const fieldSchema = { rulePath: activeTrailStr, type };
				if (value) fieldSchema.value = value;
				if (modifier) fieldSchema.modifier = modifier;
				if (booleanfy) fieldSchema.booleanfy = booleanfy;
				if (![undefined, null].includes(arity)) fieldSchema.arity = arity;
				if (optional) fieldSchema.optional = true;
				if (assert) fieldSchema.assert = assert;
				if (inference) fieldSchema.if = inference;
				if (optional && assertionTrail.dependencies.size) {
					fieldSchema.dependencies = Array.from(assertionTrail.dependencies);
				}
				// 3. Expose
				// Earlier rules have populated schemas
				for (const schema of schemaSet) {
					schema.set(exposure, fieldSchema);
				}
				if (exposure !== '.' && optional && !rule.optional) {
					// Optional context but rule NOT optional within context
					newDependencyTrail.add(exposure);
				}
			}
			if (syntax || syntaxes) {
				const newAssertionTrail = {
					dependencies: newDependencyTrail,
					optional,
					assert,
					inference,
				};
				if (syntax) {
					schemaSet = this._compileASTSchemaFromSyntaxRules(syntax, dialect, { trail: activeTrail.concat('syntax'), schemaSet, assertionTrail: newAssertionTrail });
					continue;
				}
				const newSchemaSet = new Set;
				for (const [j, syntax] of syntaxes.entries()) {
					const schemaSetClone = cloneSchemaSet(schemaSet);
					const schemaSetCloneResult = this._compileASTSchemaFromSyntaxRules(syntax, dialect, { trail: activeTrail.concat('syntaxes', j), schemaSet: schemaSetClone, assertionTrail: newAssertionTrail });
					for (const resultSchema of schemaSetCloneResult) {
						newSchemaSet.add(resultSchema);
					}
				}
				schemaSet = newSchemaSet;
			}
		}
		const schemasArray = Array.from(schemaSet);
		for (let i = 0; i < schemasArray.length; i++) {
			const schemaA = schemasArray[i];
			const schemaAObj = Object.fromEntries(schemaA);
			if (!schemaA.size) {
				schemaSet.delete(schemaA);
				continue;
			}
			for (let j = i + 1; j < schemasArray.length; j++) {
				const schemaB = schemasArray[j];
				const schemaBObj = Object.fromEntries(schemaB);
				if (_eq(schemaAObj, schemaBObj, 'cs', 'rulePath')) {
					schemaSet.delete(schemaB);
				}
			}
		}
		return schemaSet;
	}

	static fromJSON(inputJson, options = {}, callback = null) {
		// This runs first: giving "Expr" - a polymorphic interface to run
		const astSchema = this.compileASTSchemaFromSyntaxRules(options);
		// 1. Handle polymorphic interfaces
		if (Array.isArray(astSchema.type)) {
			for (const type of astSchema.type) {
				const NodeClass = registry[type];
				const result = NodeClass.fromJSON(inputJson, options, callback);
				if (result) return result;
			}
			return;
		}
		// ----------
		// Pre compilation...
		// ----------
		// 1. Handle pre-formed nodes
		if (inputJson instanceof AbstractNode) {
			if (inputJson instanceof this) return inputJson;
			return; // API mismatch
		}
		// 2. Handle typed JSON objects
		if (!_isObject(inputJson)) return;
		let hardCodedNodeName = null;
		if ('nodeName' in inputJson) {
			if (inputJson.nodeName !== this.NODE_NAME) {
				return; // API mismatch
			}
			({ nodeName: hardCodedNodeName, ...inputJson } = inputJson);
		}
		// ----------
		// Compilation...
		// ----------
		// ...defs first
		let lastAssertion;
		const $decideThrow = (message, rulePath = null, assertsGrep = false) => {
			if (!hardCodedNodeName && options.assert !== true && !(options.assert instanceof RegExp && options.assert.test(activeTrailStr))) return;
			if (rulePath) {
				message = `[${rulePath}] ${message}`;
			}
			if (assertsGrep) {
				lastAssertion = message;
				return;
			}
			throw new Error(message);
		};
		const matchTokenRule = (fieldSchema, fieldJson) => {
			// Match any predefined value list
			if (fieldSchema.value !== undefined) {
				const expectedValue = fieldSchema.booleanfy ? [true, false] : fieldSchema.value;
				return [].concat(expectedValue).includes(fieldJson.value);
			}
			// Match standard
			return TOK_TYPES[fieldSchema.type].match?.(fieldJson, options) !== false;
		}
		const resolveField = (fieldSchema, fieldValue) => {
			for (const type of [].concat(fieldSchema.type)) {
				const isTokenRule = typeof type === 'string' && type[0] === type[0].toLowerCase();
				if (isTokenRule) {
					if (matchTokenRule(fieldSchema, { value: fieldValue }) === true) return fieldValue;
				} else {
					const node = registry[type].fromJSON(fieldValue, options);
					if (node) return node;
				}
			}
		};
		const acquireField = (resultAST, fieldName, fieldSchema, assertsGrep = false) => {
			// 1. Validate dependencies
			if (fieldSchema.dependencies?.length) {
				for (const depField of fieldSchema.dependencies) {
					if (!(depField in resultAST)) {
						$decideThrow(`Missing dependency field "${depField}" required by "${fieldName}"`, fieldSchema.rulePath, assertsGrep);
						return false; // API mismatch
					}
				}
			}
			if (fieldSchema.if && !_inferenceMatch(fieldSchema.if, resultAST, fieldSchema.rulePath)) {
				return true; // Much like optional
			}
			// 2. Acquire entries
			if (![undefined, null].includes(fieldSchema.arity)) {
				if (inputJson[fieldName] === undefined) {
					// Undefined at all or empty
					if (fieldSchema.optional) {
						resultAST[fieldName] = []; // Optional empty array
						return true;
					}
					$decideThrow(`Missing required field "${fieldName}"`, fieldSchema.rulePath, assertsGrep);
					return false; // API mismatch
				}
				if (!Array.isArray(inputJson[fieldName])) {
					$decideThrow(`Field "${fieldName}" must be an array`, fieldSchema.rulePath, assertsGrep);
					return false; // Defined but API mismatch
				}
				if (fieldSchema.arity !== Infinity) {
					const count = inputJson[fieldName].length;
					if (_isObject(fieldSchema.arity)) {
						if ('min' in fieldSchema.arity && count < fieldSchema.arity.min) {
							$decideThrow(`A minimum of ${fieldSchema.arity.min} argument(s) expected but got ${count}`, fieldSchema.rulePath, assertsGrep);
							return false; // API mismatch
						}
						if ('max' in fieldSchema.arity && count > fieldSchema.arity.max) {
							$decideThrow(`A maximum of ${fieldSchema.arity.max} argument(s) expected but got ${count}`, fieldSchema.rulePath, assertsGrep);
							return false; // API mismatch
						}
					} else if (![].concat(fieldSchema.arity).includes(count)) {
						$decideThrow(`Exactly ${[].concat(fieldSchema.arity).join(' or ')} argument(s) expected but got ${count}`, fieldSchema.rulePath, assertsGrep);
						return false; // API mismatch
					}
				}
				const resultArray = inputJson[fieldName].map((entry) => resolveField(fieldSchema, entry)).filter((n) => n !== undefined);
				const resultLenth = resultArray.length;
				// Some items resolved and some didn't?: Raise integrity error
				if (inputJson[fieldName].length > resultLenth) {
					// If resolution failed for all items...
					if (!resultLenth) {
						$decideThrow(`Failed to resolve any argument for "${fieldName}"`, fieldSchema.rulePath, assertsGrep);
						return false; // API mismatch
					}
					$decideThrow(`Inconsistent "${fieldName}" argument(s)`, fieldSchema.rulePath, assertsGrep);
					return false; // API mismatch
				}
				resultAST[fieldName] = resultArray;
				return true;
			}
			// 3. Acquire classic field
			if (inputJson[fieldName] === undefined) {
				if (fieldSchema.optional) {
					resultAST[fieldName] = fieldSchema.booleanfy ? false : undefined; // Optional undefined
					return true;
				}
				$decideThrow(`Missing required field "${fieldName}"`, fieldSchema.rulePath, assertsGrep);
				return false; // API mismatch
			}
			const result = resolveField(fieldSchema, inputJson[fieldName]);
			if (result === undefined) {
				$decideThrow(`Failed to resolve field "${fieldName}"`, fieldSchema.rulePath, assertsGrep);
				return false; // API mismatch
			}
			resultAST[fieldName] = result;
			return true;
		};
		// On to the AST composition based on first match
		paths_loop: for (const $astSchema of (astSchema instanceof Map ? [astSchema] : astSchema)) {
			const resultAST = Object.create(null);
			const astSchema = new Map($astSchema);
			let $inputJson = inputJson;
			// Acquire root AST fields
			if (astSchema.has('.')) {
				const rootRule = astSchema.get('.');
				const tokSchema = TOK_TYPES[rootRule.type];
				// Transfer relevant attributes from "inputJson" to "resultAST"
				// This effectively removes root-token-level attributes from "inputJson" before the next step below
				if ([undefined, null].includes($inputJson.value)) {
					continue paths_loop;
				}
				({ value: resultAST.value, ...$inputJson } = $inputJson);
				for (const attr of Object.keys(tokSchema)) {
					if (typeof tokSchema[attr] === 'function') continue;
					if (attr in $inputJson) {
						({ [attr]: resultAST[attr], ...$inputJson } = $inputJson);
					}
				}
				if (matchTokenRule(rootRule, resultAST) === false) {
					continue paths_loop;
				}
				astSchema.delete('.');
			}
			// Acquire other AST fields
			for (const fieldName of new Set(Object.keys($inputJson).concat(...astSchema.keys()))) {
				// Handle early mismatch
				if (!astSchema.has(fieldName)) {
					continue paths_loop; // To next schema; API mismatch
				}
				const fieldSchema = astSchema.get(fieldName);
				if (acquireField(resultAST, fieldName, fieldSchema, true) === false) {
					continue paths_loop; // To next schema; API mismatch
				}
			}
			// Done here. First match!!!
			if (typeof callback === 'function') {
				return callback(resultAST, options);
			}
			return new this(resultAST, options);
		}
		$decideThrow(`Failed to match any schema${lastAssertion ? `. ${lastAssertion}` : ''}`, this.NODE_NAME);
	}

	// -----------

	toJSON(indexHint = null, options = {}) { return this.jsonfy(options); }

	jsonfy(options = {}, transformCallback = null) {
		const jsonfy = (value, key) => {
			const originalValue = value;
			if (transformCallback) {
				value = transformCallback(value, key, options);
			}
			if (value instanceof AbstractNode) {
				value = value.jsonfy(options, transformCallback);
			} else if (Array.isArray(originalValue) && Array.isArray(value) && value.every((n) => n instanceof AbstractNode)) {
				value = value.reduce((entries, value, i) => {
					const result = jsonfy(value, i);
					if (result === undefined) return entries;
					return entries.concat(result);
				}, []);
			}
			return value;
		};
		return {
			...(options.nodeNames !== false ? { nodeName: this.NODE_NAME } : {}),
			...Object.fromEntries(Object.entries(this.#ast).map(([fieldName, value]) => {
				return [fieldName, jsonfy(value, fieldName)];
			})),
		};
	}

	/**
	 * -----------
	 * PARSER API
	 * -----------
	 */

	static async parse(input, { left, minPrecedence = 0, trail = [], returningTokenStream = false, ...options } = {}) {
		const tokenStream = !(input instanceof TokenStream)
			? await TokenStream.create(input, { structured: true, spaces: true, ...options })
			: input;
		const savepoint = tokenStream.savepoint();
		if (!tokenStream.current() && !tokenStream.done) {
			await tokenStream.next();
		}
		const syntaxRules = this.syntaxRules;
		// 1. Resolve polymorphic interfaces
		let result, rulesArray;
		if ((rulesArray = [].concat(syntaxRules)).length === 1 && Array.isArray(rulesArray[0].type) && !rulesArray[0].as) {
			if (rulesArray[0].expression) {
				result = await this._parseAsExpression(tokenStream, rulesArray[0].type, { left, minPrecedence, trail: trail.concat(this.NODE_NAME), ...options });
			} else {
				result = await this._parseFromTypes(tokenStream, rulesArray[0].type, { left, minPrecedence, trail: trail.concat(this.NODE_NAME), ...options });
			}
		} else {
			// 2. Resolve full syntax rules
			const resultAST = await this._parseFromRules(tokenStream, syntaxRules, { left, minPrecedence, trail: trail.concat(this.NODE_NAME), ...options });
			if (resultAST) {
				result = new this(resultAST, { ...options, dialect: tokenStream.options.dialect });
			}
		}
		if (!result) tokenStream.restore(savepoint);
		if (returningTokenStream) {
			return { result, tokenStream };
		}
		return result;
	}

	static async _parseAsExpression(tokenStream, types, { left = null, minPrecedence, trail, ...options }) {
		if (left) throw new Error(`TODO`);
		left = await this._parseFromTypes(tokenStream, types, { minPrecedence, trail, ...options });
		while (left) {
			// Compose binary expressions (e.g., col + 2)
			const operator = await tokenStream.match('operator');
			if (!operator || operator.prec < minPrecedence) break;
			const prevLeft = left;
			const newLeft = await this._parseFromTypes(tokenStream, types, {
				left,
				minPrecedence,//: operator.prec + (operator.assoc === 'right' ? 0 : 1),
				trail,
				...options
			});
			if (!newLeft) return left;
			left = newLeft;
		}
		return left;
	}

	static async _parseFromRules(tokenStream, syntaxRules, { left, minPrecedence, trail, ...options }, resultAST = {}) {
		const rulesArray = Array.isArray(syntaxRules) ? syntaxRules : [syntaxRules];
		let numSkippedRules_dialectWise = 0;
		let newMinPrecedence = minPrecedence; // Default being 0

		for (const [i, rule] of rulesArray.entries()) {
			if (rule.dialect && rule.dialect !== tokenStream.options.dialect) {
				numSkippedRules_dialectWise++;
				continue;
			}

			// -----
			// Rule destructuring...
			// -----

			const {
				requiredSpacing,
				peek,
				type, // Usable in combination with "syntax", "syntaxes" for type === "*_block"
				value, // Token value matching
				syntax, // Mutually-exclusive with "syntaxes" and "type" - except for type === "*_block"
				syntaxes, // Mutually-exclusive with "syntax" and "type" - except for type === "*_block"
				as: exposure,
				if: inference,
				arity,
				itemSeparator,
				optional = false,
				assert = false,
				booleanfy,
				...rest
			} = rule;

			const activeTrail = trail.concat(`${Array.isArray(syntaxRules) ? i : ''}${exposure ? `<${exposure}>` : ''}` || []);
			const activeTrailStr = activeTrail.join('.');
			const unsupportedAttrs = _getUnsupportedRuleAttrs(rest);
			if (unsupportedAttrs.length) {
				throw new Error(`[${activeTrailStr}] Unsupported attributes in rule: "${unsupportedAttrs.join('", "')}".`);
			}
			const isTokenRule = typeof type === 'string' && type[0] === type[0].toLowerCase();

			// -----
			// Definitions...
			// -----
			const acquireLeft = async () => {
				if (!exposure || isTokenRule) return;
				if (rulesArray[i + 1]?.type !== 'operator') return; // Not necessary but for the purpose of failing faster
				if (Array.isArray(peek) && !await peekToken(-1)) return;
				for (const name of [].concat(type)) {
					if (left instanceof registry[name]) {
						resultAST[exposure] = left;
						return true;
					}
				}
				return false;
			};
			const matchSpacing = () => {
				const current = tokenStream.current();
				return (
					(requiredSpacing === false && !current?.spaceBefore) ||
					(requiredSpacing === true && current?.spaceBefore) ||
					(requiredSpacing === '\n' && /\n/.test(current?.spaceBefore))
				);
			};
			const peekToken = async (adjustBy = 0) => {
				if (adjustBy) return await tokenStream.match(...[peek[0] + adjustBy, ...peek.slice(1)]);
				return await tokenStream.match/*NOTE: not peek()*/(...peek);
			};
			const eatToken = async () => {
				let op;
				if ((op = await tokenStream.match('operator')) && op.prec < minPrecedence) {
					return;
				}
				const tok = await tokenStream.eat(type, type.endsWith('_block') ? undefined : value);
				if (tok?.type === 'operator') {
					newMinPrecedence = tok.prec + (tok.assoc === 'right' ? 0 : 1);
				}
				return tok;
			};
			const parseNode = async (activeTokenStream, newMinPrecedence) => {
				if (Array.isArray(type)) {
					return await this._parseFromTypes(activeTokenStream, type, { minPrecedence: newMinPrecedence, trail: activeTrail, ...options });
				}
				const NodeClass = registry[type];
				if (!NodeClass) throw new Error(`[${activeTrailStr}] Unknown node type <${type}>.`);
				return await NodeClass.parse(activeTokenStream, { minPrecedence: newMinPrecedence, trail: activeTrail, ...options });
			};
			const $decideThrow = (activeTokenStream, message, tokenStreamPosition = false) => {
				if (!assert && options.assert !== true && !(options.assert instanceof RegExp && options.assert.test(activeTrailStr))) return;
				if (tokenStreamPosition) {
					const current = activeTokenStream.current() || activeTokenStream.previous();
					const proximityTerm = activeTokenStream.current() ? (tokenStreamPosition === 1 ? ':' : ' near') : ' by';
					message += !current ? `${proximityTerm} end of stream` : `${proximityTerm}${typeof current.value === 'string' ? ` "${current.value}" (${current.type})` : ''} at <line ${current.line}, column ${current.column}>`;
				}
				throw new Error(`[${activeTrailStr}] ${message}.`);
			};

			// -----
			// Validation...
			// -----

			if (left && type) {
				if (!await acquireLeft()) return;
				left = null;
				continue;
			}

			// 2. Exit on any of the following...
			// Exit if a certain prop isn't in AST
			if (inference && !_inferenceMatch(inference, resultAST, activeTrailStr)) {
				continue; // Much like optional
			}
			// Exit if spacing doesn't match
			if (requiredSpacing !== undefined && !matchSpacing()) {
				$decideThrow(tokenStream, 'Required spacing mismatch', true);
				return;
			}
			// Exit if look-ahead fails
			if (Array.isArray(peek) && !await peekToken()) {
				$decideThrow(tokenStream, 'Peek failure', true);
				return;
			}

			// -----
			// Parsing...
			// -----

			// 1. Terminal node rules...
			if (exposure === '.') {
				if (!type || !isTokenRule) throw new Error(`[${activeTrailStr}] Terminal node rules must be token-typed rules.`);
				const tok = await eatToken();
				if (!tok) {
					$decideThrow(tokenStream, `Token of type "${type}"${value ? ` and value "${value}"` : ''} expected but got "${tokenStream.current()?.type}"`, true);
					return;
				}
				let _type, line, column, spaceBefore, prec, assoc, rest;
				({ type: _type, line, column, spaceBefore, prec, assoc, ...rest } = tok);
				Object.assign(resultAST, rest);
				continue; // To next rule
			}

			// 2. Block rules... Unwrapped for the next set of evaluation...
			let activeTokenStream = tokenStream;
			if (typeof type === 'string' && type.endsWith('_block')) {
				if (!(activeTokenStream = (await eatToken())?.value)) {
					if (optional) {
						continue; // To next rule
					}
					$decideThrow(tokenStream, `Token of type "${type}" expected but got "${tokenStream.current()?.type}"`, true);
					return;
				}
				newMinPrecedence = 0; // IMPORTANT: minPrecedence don't apply to blocks
				if (!activeTokenStream.current() && !activeTokenStream.done) {
					await activeTokenStream.next();
				}
			}

			// 3. Variadic field rules...
			if (![undefined, null].includes(arity)) {
				if (!exposure) throw new Error(`[${activeTrailStr}] Multi-argument field rules must have a "as" attribute.`);
				if (!type) throw new Error(`[${activeTrailStr}] Multi-argument field rules must have a "type" attribute.`);
				if (isTokenRule) throw new Error(`[${activeTrailStr}] Multi-argument field rules must be node-typed rules.`);

				let entry, entries = [], itemMinPrecedence = newMinPrecedence;
				if (itemSeparator?.type === 'operator') {
					// Use the binding power of the itemSeparator
					const relevantOperatorDef = itemSeparator.value && (
						activeTokenStream.options.operators?.classic.get(itemSeparator.value) || activeTokenStream.options.operators?.compound.get(itemSeparator.value)
					);
					if (relevantOperatorDef?.prec) {
						itemMinPrecedence = relevantOperatorDef?.prec + 1;
					}
				}
				while ((entry = await parseNode(activeTokenStream, itemMinPrecedence))) {
					entries.push(entry);
					if (_isObject(arity) && arity.eager === false && entries.length === arity.max) {
						break;
					}
					if (itemSeparator && !await activeTokenStream.eat(
						itemSeparator.type,
						itemSeparator.value
					)) break;
				}

				if (arity !== Infinity) {
					const count = entries.length;
					if (!count && optional) {
						continue;
					}
					const current = activeTokenStream.current();
					const currentAsUnexpected = current ? `. Unexpected ${current.type}${typeof current.value === 'string' ? ` "${current.value}"` : ''}` : '';
					if (_isObject(arity)) {
						if ('min' in arity && count < arity.min) {
							$decideThrow(activeTokenStream, `A minimum of ${arity.min} argument(s) expected but got ${count}${currentAsUnexpected}`, true);
							return;
						}
						if ('max' in arity && count > arity.max) {
							$decideThrow(activeTokenStream, `A maximum of ${arity.max} argument(s) expected but got ${count}${currentAsUnexpected}`, true);
							return;
						}
					} else if (![].concat(arity).includes(count)) {
						$decideThrow(activeTokenStream, `Exactly ${[].concat(arity).join(' or ')} argument(s) expected but got ${count}${currentAsUnexpected}`, true);
						return;
					}
				}

				resultAST[exposure] = entries;
				continue; // To next rule
			}

			// 4. Classic rules...
			let result;
			if (syntax) {
				const savepoint = activeTokenStream.savepoint();
				result = await this._parseFromRules(activeTokenStream, syntax, { left, minPrecedence: newMinPrecedence, trail: activeTrail.concat('syntax'), ...options });
				if (result === undefined) {
					activeTokenStream.restore(savepoint);
				} else if (left) {
					left = null;
				}
			} else if (syntaxes) {
				for (const [j, syntax] of syntaxes.entries()) {
					const savepoint = activeTokenStream.savepoint();
					result = await this._parseFromRules(activeTokenStream, syntax, { left, minPrecedence: newMinPrecedence, trail: activeTrail.concat('syntaxes', j), ...options });
					if (result === undefined) {
						activeTokenStream.restore(savepoint);
					} else break;
				}
				if (result !== undefined && left) {
					left = null;
				}
			} else if (!(typeof type === 'string' && type.endsWith('_block'))) {
				result = isTokenRule
					? (await eatToken())?.value
					: await parseNode(activeTokenStream, newMinPrecedence);
			} else if (!type) {
				throw new Error(`[${activeTrailStr}] Rules must have a "type", "syntax" or "syntaxes" attribute.`);
			}

			if (result === undefined && !optional) {
				$decideThrow(activeTokenStream, type ? 'Unexpected token' : null, 1);
				return;
			}

			if (exposure) {
				if (booleanfy) {
					result = result !== undefined;
				}
				resultAST[exposure] = result;
			} else if (syntax || syntaxes) {
				Object.assign(resultAST, result);
			}
		}

		if (numSkippedRules_dialectWise === rulesArray.length) {
			// IMPORTANT: Hard-exit to prevent returning a false positive, empty, resultAST
			return;
		}
		return resultAST;
	}

	static async _parseFromTypes(tokenStream, types, { left, minPrecedence, trail, ...options }) {
		for (const type of types) {
			const isTokenRule = typeof type === 'string' && type[0] === type[0].toLowerCase();

			if (isTokenRule) {
				if (await tokenStream.match(type)) {
					return await tokenStream.eat();
				}
			} else {
				const NodeClass = registry[type];
				if (!NodeClass) throw new Error(`[${this.NODE_NAME}] Unknown node type "${type}".`);
				const result = await NodeClass.parse(tokenStream, { left, minPrecedence, trail, ...options });
				if (result !== undefined) return result;
			}
		}
	}

	// -----------

	toString() { return this.stringify(); }

	stringify(options = {}) {
		// Main
		const rendering = this._stringifyFromRules(this.constructor.syntaxRules, { trail: [this.NODE_NAME], ...options });
		return rendering;
	}

	_stringifyFromRules(syntaxRules, { trail = [], startingIndentLevel = 0, autoLineBreakThreshold = 100, ...options }, renderingStats = null) {
		// Formatters
		const $space = () => ' ';
		const $lineBreak = (indentLevel) => {
			return `\n${(
				options.tabSpaces === 4 ? '\t' : ' '.repeat(options.tabSpaces || 2)
			).repeat(indentLevel)}`;
		};

		const resultTokens = [];
		const rulesArray = [].concat(syntaxRules);
		let numSkippedRules_optionalWise = 0;

		for (const [i, rule] of rulesArray.entries()) {
			if (rule.dialect && rule.dialect !== this.options.dialect) {
				continue;
			}

			// -----
			// Rule destructuring...
			// -----

			const {
				requiredSpacing,
				type,
				value,
				booleanfy,
				syntax,
				syntaxes,
				as: exposure,
				if: inference,
				arity,
				itemSeparator,
				optional = false,
				autoSpacing = requiredSpacing,
				optionalParens,
				autoIndent = false,
				autoIndentAdjust = 0,
			} = rule;

			const activeTrail = trail.concat(`${Array.isArray(syntaxRules) ? i : ''}${exposure ? `<${exposure}>` : ''}` || []);
			const activeTrailStr = activeTrail.join('.');
			let $autoIndent = autoIndent;

			if (inference && !_inferenceMatch(inference, this.#ast, this.NODE_NAME)) {
				continue;
			}

			const activeOptions = { startingIndentLevel: startingIndentLevel + (autoIndent ? 1 : 0) + autoIndentAdjust, autoLineBreakThreshold, ...options };

			let rendering;
			if (![undefined, null].includes(arity)) {
				let shouldRender = false; // Until we match items to syntax's arity
				const entries = this._get(exposure);
				if (entries) {
					if (!(shouldRender = arity === Infinity)) {
						const count = entries.length;
						if (_isObject(arity)) {
							shouldRender = (!('min' in arity) || count >= arity.min)
								&& (!('max' in arity) || count <= arity.max);
						} else {
							shouldRender = [].concat(arity).includes(count)
						}
					}
				}
				if (shouldRender) {
					const itemsRendering = entries.map((entry) => entry.stringify(activeOptions));
					$autoIndent = autoIndent === true
						|| (typeof autoIndent === 'number' && entries.length >= autoIndent)
						|| autoSpacing === '\n';
					// Determine item spacing...
					const $autoItemSpacing = activeOptions.prettyPrint && $autoIndent && itemsRendering.join(' ').length > autoLineBreakThreshold
						? $lineBreak(activeOptions.startingIndentLevel)
						: $space();
					// Compose separator
					let $itemSeparator = itemSeparator ? this._stringifyTerminal(itemSeparator, activeOptions) : '';
					if (/^\w+$/.test($itemSeparator)) {
						$itemSeparator = `${$autoItemSpacing}${$itemSeparator}${$autoItemSpacing}`;
					} else if ($itemSeparator === ';' && activeOptions.prettyPrint) {
						$itemSeparator = `${$itemSeparator}\n${$autoItemSpacing}`;
					} else {
						$itemSeparator = `${$itemSeparator}${$autoItemSpacing}`;
					}
					rendering = itemsRendering.join($itemSeparator);
				}
			} else if (syntax) {
				rendering = this._stringifyFromRules(syntax, { trail: activeTrail.concat('syntax'), ...activeOptions }, renderingStats);
			} else if (syntaxes) {
				let highestRenderingScore = -1;
				for (const [j, syntax] of syntaxes.entries()) {
					const newRenderingStats = { score: 0 };
					const $rendering = this._stringifyFromRules(syntax, { trail: activeTrail.concat('syntaxes', j), ...activeOptions }, newRenderingStats);
					if (typeof $rendering === 'string' && newRenderingStats.score > highestRenderingScore) {
						rendering = $rendering;
						highestRenderingScore = newRenderingStats.score;
					}
				}
				if (renderingStats) { renderingStats.score += highestRenderingScore; }
			} else {
				if (exposure) {
					let fieldValue = this._get(exposure === '.' ? 'value' : exposure);
					const hasExpectedValue = value !== undefined && value !== null;
					if (hasExpectedValue && booleanfy) {
						if (fieldValue === true) {
							fieldValue = value;
						}
					}
					if (hasExpectedValue) {
						if ([].concat(value).includes(fieldValue)) {
							if (renderingStats) {
								renderingStats.score++;
							}
						} else {
							fieldValue = undefined;
						}
					}
					if (fieldValue !== undefined) {
						if (fieldValue instanceof AbstractNode) {
							fieldValue = fieldValue.stringify(activeOptions);
						}
						const $rule = exposure === '.'
							? { ...rule, ...this.#ast }
							: { ...rule, value: fieldValue };
						rendering = this._stringifyTerminal($rule, activeOptions);
					}

				} else {
					rendering = this._stringifyTerminal(rule, activeOptions);
				}
			}

			// -----

			if (type === 'paren_block' && optionalParens) {
				if (!rendering?.trim()) {
					if (optionalParens === true || options.pruneOptionalParens) {
						if (renderingStats) {
							renderingStats.score++;
						}
						numSkippedRules_optionalWise++;
						continue; // Skip this rule
					}
					rendering = '';
				}
			}

			if (rendering === undefined) {
				if (optional) {
					numSkippedRules_optionalWise++;
					continue; // Skip this rule
				}
				return; // Exit whole rule sequence
			}
			if (exposure && renderingStats) {
				renderingStats.score++;
			}

			// Add "block" tags?
			let autoSpaceIgnore = false;
			if (typeof type === 'string' && type.endsWith('_block')) {
				const blockAutoLineBreakMode = activeOptions.prettyPrint && autoIndent && rendering/* *_block rendering */.length > autoLineBreakThreshold;
				const delims = { brace_block: '{}', bracket_block: '[]', paren_block: '()' }[type];

				rendering = [
					delims[0],
					blockAutoLineBreakMode && !/^\s/.test(rendering) ? $lineBreak(startingIndentLevel + 1) : (delims[0] === '{' ? $space() : ''),
					rendering,
					blockAutoLineBreakMode ? $lineBreak(startingIndentLevel) : (delims[1] === '}' ? $space() : ''),
					delims[1],
				].join('');
			} else if (activeOptions.prettyPrint && $autoIndent && rendering !== '') {

				rendering = [
					$lineBreak(startingIndentLevel + (autoSpacing === '\n' ? 0 : 1)),
					rendering,
				].join('');

				autoSpaceIgnore = true;
			}
			// Space this chunk?
			const precedingTok = resultTokens[resultTokens.length - 1];
			if (rendering !== ''
				&& !autoSpaceIgnore
				&& resultTokens.length
				// "Do" autoSpacing didnt already end with a space character
				&& !/\s$/.test(precedingTok)
				// "Force" autoSpacing if previous token ends as alphanumeric and new token (rendering) starts as alphanumeric
				&& (Array.isArray(autoSpacing) ? autoSpacing.includes(precedingTok) : autoSpacing !== false)) {
				if (autoSpacing === '\n' && activeOptions.prettyPrint) {
					resultTokens.push($lineBreak(startingIndentLevel));
				} else {
					resultTokens.push($space());
				}
			}
			resultTokens.push(rendering);
		}
		if (resultTokens.length || numSkippedRules_optionalWise === rulesArray.length) {
			return resultTokens.join('');
		}
	}

	_stringifyTerminal(tok, options = {}) {
		switch (tok.type) {
			case 'data_type': return this._stringifyDataType(tok, options);
			case 'identifier': return this._stringifyIdentifier(tok, options);
			case 'keyword': return this._stringifyKeyword(tok, options);
			case 'operator': return this._stringifyOperator(tok, options);
			case 'punctuation': return this._stringifyPunctuation(tok, options);
			case 'bind_var': return this._stringifyBindVar(tok, options);
			case 'version_spec': return `@${tok.value}`;
		}
		if (!Array.isArray(tok.type)) {
			if (tok.type.endsWith('_literal')) {
				return this._stringifyLiteral(tok, options);
			}
			if (tok.type.endsWith('_var')) {
				return this._stringifyVariable(tok, options);
			}
			if (tok.type.endsWith('_comment')) {
				return this._stringifyComment(tok, options);
			}
		}
		return String(tok.value);
	}

	_stringifyIdentifier(tok) {
		const { value } = tok;
		const delimChars = ['"'];
		// ------------
		// Resolve from mysqlAnsiQuotes if mysql...
		if (this.options.dialect === 'mysql') {
			if (this.options.mysqlAnsiQuotes) {
				delimChars.push('`'); // Backticks is ALSO identifier delim
			} else {
				delimChars.fill('`'); // Backticks is ONLY identifier delim
			}
		}
		// Use tok-specified delim if valid
		const delimChar = delimChars.includes(tok.delim)
			? tok.delim // Choose this one
			: delimChars[0];
		// ------------
		const shouldQuote = /^\d/.test(value) || !/^(\*|[\w]+)$/.test(value);
		return shouldQuote
			? `${delimChar}${(value || '').replace(new RegExp(delimChar, 'g'), delimChar.repeat(2))}${delimChar}`
			: value;
	}

	_stringifyKeyword(tok) { return String(tok.value); }

	_stringifyOperator(tok) {
		if (tok.value === ':' && this.#contextNode?.isProperty) {
			return '\\:';
		}
		return String(tok.value);
	}

	_stringifyPunctuation(tok) { return String(tok.value); }

	_stringifyDataType(tok) { return String(tok.value); }

	_stringifyLiteral(tok, options) {
		const { value } = tok;
		// ------------
		switch (tok.type) {
			case 'bit_literal': return this._stringifyBitLiteral(tok, options);
			case 'hex_literal': return this._stringifyHexLiteral(tok, options);
			case 'number_literal': return this._stringifyNumberLiteral(tok, options);
			case 'string_literal': return this._stringifyStringLiteral(tok, options);
			case 'bool_literal': return /^true$/i.test(value + '') ? 'TRUE' : 'FALSE';
			case 'null_literal': return 'NULL';
		}
		return String(value);
	}

	_stringifyBindVar(tok) {
		const { value } = tok;
		// ------------
		if (this.options.dialect === 'mysql') {
			return `?`;
		}
		return `$${value}`;
	}

	_stringifyBitLiteral(tok) {
		const { value } = tok;
		// ------------
		if (this.options.dialect === 'mysql') {
			return `0b${value}`;
		}
		return `B'${value}'`;
	}

	_stringifyHexLiteral(tok) {
		const { value } = tok;
		// ------------
		if (this.options.dialect === 'mysql') {
			return `0x${value}`;
		}
		return `X'${value}'`;
	}

	_stringifyNumberLiteral(tok) {
		const { value } = tok;
		// ------------
		return String(value);
	}

	_stringifyStringLiteral(tok) {
		let { value } = tok;
		const delimChars = ["'"];
		let escChar = null;
		// ------------
		// Resolve from dialect...
		if (this.options.dialect === 'postgres' && tok.delim?.startsWith('$')) {
			delimChars.fill(tok.delim); // OVERRIDE
		} else if (this.options.dialect === 'mysql' && !this.options.mysqlAnsiQuotes) {
			delimChars.push('"'); // Double quotes is ALSO string delim
		}
		// Use tok-specified delim if valid
		const delimChar = delimChars.includes(tok.delim)
			? tok.delim // Choose this one
			: delimChars[0];
		// Using backslash escaping?
		if (this.options.dialect === 'mysql' && !this.options.mysqlNoBackslashEscapes
			|| this.options.dialect === 'postgres' && tok.modifier === 'E') {
			escChar = '\\'; // In which case: the delim plus [\\\0\b\r\n\t\x1A] are backslashed/encoded
		}
		// ------------
		// Is Postgres dollar-quoted string?
		if (delimChar.length > 1) { // e.g. for $$string$$
			return `${delimChar}${value}${delimChar}`;
		}
		if (!escChar) {
			escChar = delimChar;
		} else if (escChar === '\\') {
			const defs = {
				'\\': '\\\\', // from backslash char itself
				'\0': '\\0', // from NUL byte (ASCII 0)
				'\b': '\\b', // from backspace (ASCII 8)
				'\f': '\\f', // from form feed
				'\n': '\\n', // from newline
				'\r': '\\r', // from carriage return
				'\t': '\\t', // from tab
				'\v': '\\v', // from vertical tab
				'\x1A': '\\Z' // from ASCII 26 (SUB / Control+Z) - as represented in JS
			};
			value = value.replace(/[\\\0\b\r\n\t\x1A]/g, (match) => defs[match]);
		}
		value = `${delimChar}${(value || '').replace(new RegExp(delimChar, 'g'), `${escChar}${delimChar}`)}${delimChar}`;
		return tok.modifier
			? `${tok.modifier}${value}`
			: value;
	}

	_stringifyVariable(tok) {
		const { type, value } = tok;
		// ------------
		if (this.options.dialect === 'mysql') {
			return `${type === 'system_var' ? '@@' : '@'}${value}`;
		}
		return `${this.#contextNode?.isProperty ? '\\:' : ':'}${value}`;
	}

	_stringifyComment(tok, options = {}) {
		const { value } = tok;
		// ------------
		if (tok.type === 'block_comment') {
			const indent = '  '.repeat(options.startingIndentLevel || 0);
			const lines = value.trim().split('\n').map((line) => line.trim());
			const formatted = [
				`${indent}/**`,
				...lines.map((line) => `${indent} * ${line}`),
				`${indent} */`
			];
			return formatted.join('\n');
		}
		// ------------
		const delimChars = ['--'];
		if (this.options.dialect === 'mysql') {
			delimChars.push('#');
		}
		const delimChar = delimChars.includes(tok.delim)
			? tok.delim
			: delimChars[0];
		return `${delimChar} ${value}`;
	}
}

const _getUnsupportedRuleAttrs = (rule) => {
	return Object.keys(rule).filter((k) => !supportedRuleAttrs.has(k));
};
const supportedRuleAttrs = new Set([
	'dialect',
	// 1. Pretty-printing
	'autoSpacing',
	'optionalParens',
	'autoIndent',
	'autoIndentAdjust',
	// 2. Type system: token and node
	'type',
	// 2.1 Token matching
	'value',
	'delim',
	'modifier',
	// 2.2 Compound matching
	'syntax',
	'syntaxes',
	// 3. AST fields
	'as',
	'booleanfy',
	'if',
	// 4. Variadic fields
	'arity',
	'itemSeparator',
	'keyed',
	// 5. Other attributes
	'requiredSpacing',
	'peek',
	'optional',
	'assert',
]);

const _inferenceMatch = (inference, resultAST, activeTrailStr) => {
	return [].concat(inference).some((criteria) => {
		if (_isObject(criteria)) {
			return Object.entries(criteria).every(([key, value]) => {
				let exp = true;
				if (key.startsWith('!')) {
					key = key.slice(1);
					exp = false;
				}
				return (
					Array.isArray(value) ? value.includes(resultAST[key]) : resultAST[key] === value
				) === exp;
			});
		}
		if (typeof criteria !== 'string') throw new Error(`[${activeTrailStr}] A specifier of type string or object expected in inferenceMatch but got ${criteria === null ? 'null' : `type ${typeof criteria}`}`);
		let exp = true;
		if (criteria.startsWith('!')) {
			criteria = criteria.slice(1);
			exp = false;
		}
		return (![undefined, null, false].includes(resultAST[criteria])) === exp;
	});
};