import { Lexer } from '../../Lexer.js';
import { PathJunction } from './PathJunction.js';
import { AbstractPath } from './AbstractPath.js';
import { JsonObjectSpec } from '../json/JsonObjectSpec.js';
import { JsonArraySpec } from '../json/JsonArraySpec.js';
import { ColumnsSpec } from '../../dml/clauses/ColumnsSpec.js';
import { ColumnRef } from '../refs/ColumnRef.js';
import { JsonAgg } from '../json/JsonAgg.js';
import { JsonPath } from '../json/JsonPath.js';

export class PathRight extends AbstractPath {
	static get OPERATORS() { return [ '~>', { test: ':(?=\\s*[{([])', operator: ':' } ]; }
	static get LHS_TYPES() { return [PathJunction,ColumnRef]; }
    static get RHS_TYPES() { return [this,JsonPath,JsonAgg,JsonObjectSpec,JsonArraySpec,ColumnsSpec,ColumnRef]; }
	static get DESUGARS_TO() { return this.LHS_TYPES; }

	$capture(requestName, requestSource) {
		if (requestName === 'TABLE_SCHEMA') {
			if (requestSource === this.rhs()) return this.schema();
			if (requestSource === this.lhs() && this.contextNode instanceof PathRight) {
				// Which means if immediate context isn't PathRight, request bubbles
				return this.contextNode.schema();
			}
		}
		return super.$capture(requestName, requestSource);
	}

	schema() {
		if (this.lhs() instanceof PathJunction) return this.lhs().schema();
		const fk = this.lhs().schema().foreignKey();
		if (!fk) throw new Error(`[${ this }]: Column ${ this.lhs().clone({ fullyQualified: true }) } is not a foreign key.`);
		return fk.targetTable()/*the table in there*/.schema();
	}

	endpoint() { return this.rhs() instanceof PathRight ? this.rhs().endpoint() : this.rhs(); }

	prettyName() { return this.clone({ asProperty: true }).stringify(); }

    jsonfy(options = {}, jsonIn = {}) {
		if (options.asProperty && [JsonObjectSpec,JsonArraySpec,JsonAgg,ColumnsSpec].some(c => this.rhs() instanceof c)) {
			return this.lhs().jsonfy({ ...options, asProperty: false }, jsonIn);
		}
        return super.jsonfy(options);
    }

	static parse(context, expr, parseCallback) {
		const { tokens: [lhs, rhs], matches: [operator] } = Lexer.lex(expr, this.OPERATORS, { limit: 1, useRegex: true });
		if (!lhs || !operator || !rhs) return;
		const instance = (new this(context)).operator(operator);
		instance.lhs(parseCallback(instance, lhs.trim(), this.LHS_TYPES));
		instance.rhs(parseCallback(instance, rhs.trim(), this.RHS_TYPES));
		return instance;
	}

	stringify() {
		if (this.operator() === ':') return `${ this.lhs() }: ${ this.rhs() }`;
		return super.stringify();
	}
}