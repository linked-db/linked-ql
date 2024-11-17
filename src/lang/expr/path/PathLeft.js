import { Lexer } from '../../Lexer.js';
import { AbstractPath } from './AbstractPath.js';
import { ColumnRef } from '../refs/ColumnRef.js';
import { PathRight } from './PathRight.js';

export class PathLeft extends AbstractPath {
	static get OPERATORS() { return ['<~']; }
	static get LHS_TYPES() { return [PathLeft,ColumnRef]; }
    static get RHS_TYPES() { return [ColumnRef]; }
	static get DESUGARS_TO() { return [PathRight]; }

	$capture(requestName, requestSource) {
		if (requestName === 'TABLE_SCHEMA') {
			if (requestSource === this.lhs()) return this.schema();
			if (requestSource === this.rhs() && this.contextNode instanceof PathLeft) {
				// Which means if immediate context isn't PathLeft, request bubbles
				return this.contextNode.schema();
			}
		}
		return super.$capture(requestName, requestSource);
	}
	
	static get expose() {
		return {
			path: (context, lhs, operator, rhs) => this.fromJSON(context, { lhs, operator, rhs }),
			lpath: (context, lhs, rhs) => this.fromJSON(context, { lhs, operator: '<~', rhs }),
		};
	}

	schema() {
		const fk = this.rhs().schema().foreignKey();
		if (!fk) throw new Error(`[${ this }]: Column ${ this.rhs().clone({ fullyQualified: true }) } is not a foreign key.`);
		return fk.targetTable()/*the table in there*/.schema();
	}

	endpoint() { return this.lhs() instanceof PathLeft ? this.lhs().endpoint() : this.lhs(); }

    jsonfy(options = {}, jsonIn = {}) {
        if (!options.reverse) return super.jsonfy(options, jsonIn);
        return {
            nodeName: PathRight.NODE_NAME,
            lhs: this.rhs()?.jsonfy(options),
            rhs: this.lhs()?.jsonfy(options),
            operator: '~>',
        };
    }

	static parse(context, expr, parseCallback) {
		const tokens = Lexer.split(expr, this.OPERATORS, { useRegex: true });
		if (tokens.length < 2) return;
		const operator = this.OPERATORS[0];
		const instance = (new this(context)).operator(operator);
		instance.rhs(parseCallback(instance, tokens.pop()/*NOTE: last*/.trim(), this.RHS_TYPES));
		return instance.lhs(parseCallback(instance, tokens.join(operator).trim(), this.LHS_TYPES));
	}
}
