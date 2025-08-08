export const PathMixin = (Class) => class extends Class {

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
			{ ...[].concat(super.syntaxRules)[0], autoSpacing: false },
		];
	}

	static get syntaxRules() { return this.buildSyntaxRules(); }

	static get syntaxPriority() { return -1; }

	/* AST API */

	qualifier() { return this._get('qualifier'); }

	/* API */

	identifiesAs(ident, cs = undefined) {
		const result = super.identifiesAs(ident, cs);
		if (result && this.qualifier() && ident.qualifier?.()) {
			return this.qualifier().identifiesAs(ident.qualifier(), cs);
		}
		return result;
	}

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