import { Transformer } from '../../Transformer.js';
import { FromItem } from '../TA/FromItem.js';

export class JoinClause extends FromItem {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            syntaxes: [
                [
                    { type: 'keyword', as: 'join_type', value: 'CROSS' },
                    { type: 'keyword', value: 'JOIN', assert: true },
                    ...[].concat(super.syntaxRules),
                ],
                [
                    { type: 'keyword', as: 'natural_kw', value: 'NATURAL', booleanfy: true, optional: true },
                    {
                        optional: true,
                        syntaxes: [
                            { type: 'keyword', as: 'join_type', value: 'INNER' },
                            [
                                { type: 'keyword', as: 'join_type', value: ['LEFT', 'RIGHT', 'FULL'], dialect: 'postgres' },
                                { type: 'keyword', as: 'join_type', value: ['LEFT', 'RIGHT'], dialect: 'mysql' },
                                { type: 'keyword', as: 'outer_kw', value: 'OUTER', booleanfy: true, optional: true },
                            ],
                        ],
                    },
                    { type: 'keyword', value: 'JOIN' },
                    ...[].concat(super.syntaxRules),
                    { type: ['OnClause', 'UsingClause'], as: 'condition_clause', if: '!natural_kw', assert: true, autoIndent: true },
                ],
            ],
        };
    }

    /* AST API */

    naturalKW() { return this._get('natural_kw'); }

    joinType() { return this._get('join_type'); }

    outerKW() { return this._get('outer_kw'); }

    conditionClause() { return this._get('condition_clause'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, schemaInference = null) {
        let conditionClauseTransform;

        if (options.deSugar) {
            transformer = new Transformer((node, defaultTransform, keyHint) => {
                if (keyHint === 'condition_clause') {
                    conditionClauseTransform = defaultTransform;
                } else return defaultTransform();
            }, transformer, this.statementNode/* IMPORTANT */);
        }

        let resultJson = super.jsonfy(options, transformer, schemaInference);

        if (conditionClauseTransform) {
            resultJson = {
                ...resultJson,
                condition_clause: conditionClauseTransform(),
            };
        }

        return resultJson;
    }
}