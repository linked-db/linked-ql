import { _isObject } from '@webqit/util/js/index.js';
import { ErrorRefAmbiguous } from './abstracts/ErrorRefAmbiguous.js';
import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { Identifier } from './Identifier.js';
import { registry } from '../../registry.js';

export class IdentifierPath extends Identifier {

	/* SYNTAX RULES */

	static get _qualifierType() { return 'Identifier'; }

	static buildSyntaxRules(baseRule = null) {
		return [
			{
				optional: true,
				syntax: [
					{ type: this._qualifierType, as: 'qualifier' },
					{ type: 'punctuation', value: '.', assert: true, autoSpacing: false },
				],
			},
			baseRule ||
			{ ...[].concat(super.syntaxRules), autoSpacing: false },
		];
	}

	static get syntaxRules() { return this.buildSyntaxRules(); }

	static get syntaxPriority() { return -1; }

	/* AST API */

	qualifier(init = null) {
		const qualifier = this._get('qualifier');
		if (!arguments.length) return qualifier;
		// Return a fresh instance
		if (init !== true && typeof init !== 'string') {
			throw new TypeError('"init" must be true or a string.');
		}
		const name = this._get('value');
		if (!name && !qualifier && init === true) {
			throw new TypeError('Can\'t auto-derive qualifier for anonymous ident.');
		}
		const QualifierClass = registry[[].concat(this._qualifierType)[0]];
		if (!QualifierClass) {
			throw new TypeError(`Unknown qualifier type "${this._qualifierType}".`);
		}
		let qualifierNode = QualifierClass.fromJSON(init === true && qualifier?.jsonfy() || { value: init === true ? '' : init });
		this._adoptNodes(qualifierNode); // so that events/contexts are properly set up
		// If typeof init === 'string'
		// - it becomes value of qualifierNode, and that's all
		// If init === true:
		// - if qualifier, qualifierNode is first a clone of qualifier
		// - if not qualifier, then qualifierNode is initially empty
		if (init === true && !qualifier) {
			const entriesField = `${this.constructor._domainKind}s`;
			const possibleQualifierSchemas = qualifierNode.selectSchema((possibleQualifierSchema) => possibleQualifierSchema._has(entriesField, name));
			if (possibleQualifierSchemas.length > 1) {
				const refs = possibleQualifierSchemas.map((s) => this.constructor.fromJSON({ qualifier: s.name().jsonfy({ nodeNames: false }), value: name }));
				throw new ErrorRefAmbiguous(`[${this.parentNode || this}] "${name}" is ambiguous. (Is it ${refs.join(' or ')}?)`);
			} else if (!possibleQualifierSchemas.length) {
				throw new ErrorRefUnknown(`[${this.parentNode || this}]: "${name}" is unknown.`);
			}
			this._unadoptNodes(qualifierNode);
			qualifierNode = QualifierClass.fromJSON(possibleQualifierSchemas[0].name().jsonfy({ nodeNames: false, fullyQualified: true }));
			this._adoptNodes(qualifierNode); // so that events/contexts are properly set up
		}
		return qualifierNode;
	}

	/* API */

	identifiesAs(ident) {
		if (ident instanceof Class) {
			return this._eq(this.value(), ident.value(), 'ci')
				&& (!ident.qualifier() || !!this.qualifier(true).identifiesAs(ident.qualifier()));
		}
		return super.identifiesAs(ident);
	}

	selectSchema(filter = null) {
		const name = this.value();
		const possibleParentSchemas = this.qualifier(true).schema();
		const entriesField = `${this.constructor._domainKind}s`;
		return possibleParentSchemas.reduce((schemas, possibleParentSchema) => {
			// "If" we have a name...
			const matches = name
				// narrow down to us within possibleParentSchema
				? [].concat(possibleParentSchema._get(entriesField, name) || [])
				// otherwise, select all children of our kind
				: possibleParentSchema._get(entriesField);
			// Optionally further filter matches
			return schemas.concat(filter ? matches.filter(filter) : matches);
		}, []);
	}

	/* DESUGARING API */

	jsonfy(options = {}, transformCallback = null) {
		let resultJson = super.jsonfy(options, transformCallback);
		if (!resultJson.qualifier && (options.deSugar || options.fullyQualified)) {
			const qualifier = this.qualifier(true).jsonfy(options, transformCallback);
			resultJson = {
				...resultJson,
				qualifier: qualifier.value ? qualifier : undefined
			};
		}
		return resultJson;
	}

	/* PARSER API */

	static async parse(input, { left = undefined, minPrecedence = 0, trail = [], ...options } = {}) {
		if (left) return;
		const tokenStream = await this.toStream(input, options);
		const qualifierTokens = [];
		while (true) {
			if (await tokenStream.match(1, 'punctuation', '.')) {
				qualifierTokens.push(await tokenStream.eat());
			} else if (await tokenStream.match(1, 'version_spec') && await tokenStream.match(2, 'punctuation', '.')) {
				qualifierTokens.push(await tokenStream.eat());
				qualifierTokens.push(await tokenStream.eat());
			} else break;
			// Determine whether to eat the punctuation ahead pf another loop
			if (await tokenStream.match(2, 'punctuation', '.') || (await tokenStream.match(2, 'version_spec') && await tokenStream.match(3, 'punctuation', '.'))) {
				qualifierTokens.push(await tokenStream.eat());
			}
		}
		const qualifierExposure = 'qualifier';
		if (qualifierTokens.length) {
			const qualifierTypes = [].concat(this._qualifierType);
			const qualifierStream = await this.toStream(qualifierTokens, options);
			const qualifierOptions = { minPrecedence, trail: trail.concat(this.NODE_NAME, `<${qualifierExposure}>`), ...options };
			left = await this._parseFromTypes(qualifierStream, qualifierTypes, qualifierOptions);
		} else {
			left = false; // Explicitly set to false to prevent super.parse() trying parsing the qualifier rule
		}
		return await super.parse(tokenStream, { left, minPrecedence, trail, ...options });
	}
}