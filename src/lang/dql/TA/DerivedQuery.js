import { AbstractNode } from '../../abstracts/AbstractNode.js';
import { ResultSchemaMixin } from '../../abstracts/ResultSchemaMixin.js';
import { ParenExpr } from '../../expr/abstraction/ParenExpr.js';

export class DerivedQuery extends ResultSchemaMixin(ParenExpr) {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            type: 'paren_block',
            syntax: { type: ['SelectStmt', 'TableStmt', 'CTE'], as: 'expr', autoIndent: true },

        };
    }

    static get syntaxPriority() { return -1; }

    /* TYPESYS API */

    dataType() { return this.expr()?.dataType(); }

    #is_correlated = false;

    isCorrelated() { return this.#is_correlated; }

    /* JSON API */

    static fromJSON(inputJson, options = {}, callback = null) {
        if (!inputJson || inputJson instanceof AbstractNode) {
            return super.fromJSON(inputJson, options, callback);
        }
        const { is_correlated, ...restJson } = inputJson;
        const instance = super.fromJSON(restJson, options, callback);
        if (instance && is_correlated) {
            if (typeof is_correlated !== 'boolean') {
                throw new Error(`Invalid value passed at inputJson.is_correlated`);
            }
            instance.#is_correlated = is_correlated;
        }
        return instance;
    }

    jsonfy(options = {}, transformer = null, dbContext = null) {
        const statementContextArtifacts = transformer?.statementContext?.artifacts || new Map;
        statementContextArtifacts.set('derivedQueryCorrelationFlag', null);

        let resultJson = super.jsonfy(options, transformer, dbContext);

        const correlationFlag = statementContextArtifacts.get('derivedQueryCorrelationFlag');
        statementContextArtifacts.delete('derivedQueryCorrelationFlag');

        if (options.deSugar) {
            const resultSchema = resultJson.expr?.result_schema;
            resultJson = {
                ...resultJson,
                is_correlated: !!correlationFlag,
                result_schema: resultSchema,
            };
        } else {
            resultJson = {
                ...resultJson,
                is_correlated: this.#is_correlated,
            };
        }

        return resultJson;
    }
}