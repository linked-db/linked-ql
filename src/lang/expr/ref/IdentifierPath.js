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

	/* API */

	qualifier(init = null) {
		const qualifier = this._get('qualifier');
		if (!arguments.length) return qualifier;
		// Return a fresh instance
		if (init !== true && typeof init !== 'string') {
			throw new TypeError('"init" must be true or a string.');
		}
		const name = this._get('value');
		if (!name && !qualifier && init === true) {
			throw new TypeError('Can\'t auto-resolve qualifier for anonymous ident.');
		}
		const QualifierNode = registry[[].concat(this._qualifierType)[0]];
		const instance = QualifierNode.fromJSON(init === true && qualifier?.jsonfy() || { value: init !== true ? '' : init });
		this._adoptNodes(instance);
		// If typeof init === 'string'
		// - it becomes value of instance, and that's all
		// If init === true:
		// - if qualifier, instance is first a clone of qualifier
		// - if not qualifier, then instance is initially empty
		if (init === true && !qualifier) {
			const entriesField = `${this.constructor._domainKind}s`;
			const possibleQualifierSchemas = instance.selectSchema((possibleQualifierSchema) => possibleQualifierSchema._has(entriesField, name));
			if (possibleQualifierSchemas.length > 1) {
				const refs = possibleQualifierSchemas.map((s) => this.constructor.fromJSON({ qualifier: s.name(), value: this.value() }));
				throw new ErrorRefAmbiguous(`[${this.clone({ fullyQualified: true })}]: ${this.value()} is ambiguous. (Is it ${refs.join(' or ')}?)`);
			} else if (!possibleQualifierSchemas.length) {
				throw new ErrorRefUnknown(`[${this.clone({ fullyQualified: true })}]: ${this.value()} is unknown.`);
			}
			instance._set('value', possibleQualifierSchemas[0].name());
		}
		return instance;
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

	identifiesAs(ident) {
		if (ident instanceof Class) {
			return this._eq(this.value(), ident.value(), 'ci')
				&& (!ident.qualifier() || !!this.qualifier(true).identifiesAs(ident.qualifier()));
		}
		return super.identifiesAs(ident);
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
}