import { _isObject } from '@webqit/util/js/index.js';
import { ErrorRefAmbiguous } from './abstracts/ErrorRefAmbiguous.js';
import { ErrorRefUnknown } from './abstracts/ErrorRefUnknown.js';
import { Identifier } from './Identifier.js';
import { registry } from '../../registry.js';
import { _eq } from '../../util.js';

export class IdentifierPath extends Identifier {

	/* SYNTAX RULES */

	static get _schemaType() { return 'AbstractSchema'; }

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
			{ ...[].concat(super.syntaxRules)[0], autoSpacing: false },
		];
	}

	static get syntaxRules() { return this.buildSyntaxRules(); }

	static get syntaxPriority() { return -1; }

	/* AST API */

	qualifier(init = null, linkedDb = null) {
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

		let qualifierNode = QualifierClass.fromJSON(init === true && qualifier?.jsonfy({ fullyQualified: true }, null, linkedDb) || { value: init === true ? '' : init });
		this._adoptNodes(qualifierNode); // so that events/contexts are properly set up

		// If typeof init === 'string'
		// - it becomes value of qualifierNode, and that's all
		// If init === true:
		// - if qualifier, qualifierNode is first a clone of qualifier
		// - if not qualifier, then qualifierNode is initially empty

		if (init === true && !qualifier && linkedDb) {
			const cs = this._has('delim');

			const objectKind = this.constructor._objectKind;
			const SchemaClass = registry[`${objectKind}Schema`];
			if (!SchemaClass) {
				throw new TypeError(`No corresponding schema class "${objectKind}Schema" found for object type "${objectKind}".`);
			}

			const potentialQualifierSchemas = qualifierNode.selectSchema((potentialQualifierSchema) => potentialQualifierSchema._get('entries', name, cs) instanceof SchemaClass, linkedDb);

			if (potentialQualifierSchemas.length > 1) {
				const refs = potentialQualifierSchemas.map((s) => this.constructor.fromJSON({ qualifier: s.name().jsonfy({ nodeNames: false }, null, linkedDb), value: name }));
				throw new ErrorRefAmbiguous(`[${this.parentNode || this}] ${objectKind} ${this} is ambiguous. (Is it ${refs.join(' or ')}?)`);
			} else if (!potentialQualifierSchemas.length) {
				throw new ErrorRefUnknown(`[${this.parentNode || this}] ${objectKind} ${this} is unknown.`);
			}

			this._unadoptNodes(qualifierNode);

			qualifierNode = QualifierClass.fromJSON(potentialQualifierSchemas[0].name().jsonfy({ nodeNames: false }, null, linkedDb));
			this._adoptNodes(qualifierNode); // so that events/contexts are properly set up
		}

		return qualifierNode;
	}

	/* SCHEMA API */

	selectSchema(filter = null, linkedDb = null) {
		const name = this.value();
		const cs = this._has('delim');

		const potentialParentSchemas = this.qualifier(true).selectSchema(null, linkedDb);
		const resultSchemas = [];

		const objectKind = this.constructor._objectKind;
		const SchemaClass = registry[`${objectKind}Schema`];
		if (!SchemaClass) {
			throw new TypeError(`No corresponding schema class "${objectKind}Schema" found for object type "${objectKind}".`);
		}

		for (const potentialParentSchema of potentialParentSchemas) {
			for (const childSchema of potentialParentSchema._get('entries')) {
				if (!(childSchema instanceof SchemaClass)) continue;
				if (name && !childSchema.identifiesAs(name, cs)) continue;
				if (filter && !filter(childSchema)) continue;
				resultSchemas.push(childSchema);
			}
		}

		return resultSchemas;
	}

	deriveSchema(linkedDb) {
		const name = this.value();
		const objectKind = this.constructor._objectKind;

		const potentialSchemas = this.selectSchema(null, linkedDb);

		if (potentialSchemas.length > 1) {
			const refs = potentialSchemas.map((s) => s.name().clone({ fullyQualified: true }, null, linkedDb));
			throw new ErrorRefAmbiguous(`[${this.parentNode || this}] ${objectKind} ${this} is ambiguous. (Is it ${refs.join(' or ')}?)`);
		} else if (!potentialSchemas.length) {
			throw new ErrorRefUnknown(`[${this.parentNode || this}] ${objectKind} ${this} is unknown.`);
		}

		return potentialSchemas[0];
	}

	/* API */

	identifiesAs(ident, ci = undefined) {
		if (ident instanceof Identifier) {
			return _eq(this.value(), ident.value(), ci)
				&& (!ident.qualifier() || !this.qualifier() || !!this.qualifier().identifiesAs(ident.qualifier(), ci));
		}
		return super.identifiesAs(ident, ci);
	}

	/* DESUGARING API */

	jsonfy(options = {}, transformCallback = null, linkedDb = null) {
		let resultJson = super.jsonfy(options, transformCallback, linkedDb);
		if (!resultJson.qualifier && (options.deSugar || options.fullyQualified)) {
			const qualifier = this.qualifier(true, linkedDb).jsonfy(options, null, linkedDb);
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