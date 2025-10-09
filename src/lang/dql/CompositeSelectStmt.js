import { SelectStmt } from './SelectStmt.js';
import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';

export class CompositeSelectStmt extends SelectStmt {

    /* SYNTAX RULES */

    static get syntaxRules() {
        const operandTypes = ['DerivedQuery', 'ValuesTableLiteral', 'ValuesConstructor', 'TableStmt', 'BasicSelectStmt'];
        return [
            { type: [...operandTypes, 'CompositeSelectStmt'], as: 'left' },
            { type: 'operator', as: 'operator', value: ['INTERSECT', 'UNION', 'EXCEPT'], autoSpacing: '\n' },
            { type: 'keyword', as: 'all_or_distinct', value: ['ALL', 'DISTINCT'], optional: true },
            { type: operandTypes, as: 'right', assert: true, autoSpacing: '\n' },
            ...
            this.buildSyntaxRules(2),
        ];
    }

    static get syntaxPriority() { return -1; }

    /* AST API */

    left() { return this._get('left'); }

    operator() { return this._get('operator'); }

    allOrDistinct() { return this._get('all_or_distinct'); }

    right() { return this._get('right'); }

    // --------

    orderByClause() { return this._get('order_by_clause'); }

    offsetClause() { return this._get('offset_clause'); }

    limitClause() { return this._get('limit_clause'); }

    forClause() { return this._get('for_clause'); }

    // -- Postgres

    pgFetchClause() { return this._get('pg_fetch_clause'); }

    // --------

    get length() { return this.left()?.length ?? 0; }

    [Symbol.iterator]() { return (this.left() || [])[Symbol.iterator](); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        if (!options.deSugar) return super.jsonfy(options, transformer, schemaInference);

        const deferedTransforms = { order_by_clause: null };
        transformer = new Transformer((node, defaultTransform) => {
            if (node instanceof registry.OrderByClause) {
                deferedTransforms.order_by_clause = defaultTransform;
                return; // Exclude for now
            }
            return defaultTransform();
        }, transformer, this/* IMPORTANT */);

        let resultJson = super.jsonfy(options, transformer, schemaInference);

        const resultSchema = resultJson.left.result_schema;
        transformer.statementContext.artifacts.set('outputSchemas', new Set(resultSchema?.entries() || []));
        const order_by_clause = deferedTransforms.order_by_clause?.();

        resultJson = { ...resultJson, order_by_clause, result_schema: resultSchema };
        return resultJson;
    }

    /* Parser */

    static async _parseFromRules(tokenStream, syntaxRules, { left = undefined, minPrecedence = 0, trail, ...options }, resultAST = {}) {
        // TODO: a better way to fix this left recursion
        const trailTail = trail.slice(-3);
        if (trailTail[0] === this.NODE_NAME && trailTail[2] === this.NODE_NAME) return;
        // Special support for Pratt parsers that might be bringing "CompleteSelectStmt" as left.
        if ((await tokenStream.match('operator'))?.isSetOp && left instanceof registry.CompleteSelectStmt) {
            // We first assert
            if (left.orderByClause() || left.offsetClause() || left.limitClause() || left.forClause()) {
                const current = tokenStream.current();
                const message = `[${this.NODE_NAME}] Unexpected ${current.type} token:${typeof current.value === 'string' ? ` "${current.value}"` : ''} at <line ${current.line}, column ${current.column}>`;
                throw new SyntaxError(message);
            }
            // We auto convert
            left = registry.BasicSelectStmt.fromJSON({ ...left.jsonfy(), nodeName: undefined });
        }
        return await super._parseFromRules(tokenStream, syntaxRules, { left, minPrecedence, trail, ...options }, resultAST);
    }
}