import { AbstractNonDDLStmt } from '../abstracts/AbstractNonDDLStmt.js';
import { Transformer } from '../Transformer.js';
import { registry } from '../registry.js';

export class CTE extends AbstractNonDDLStmt {

    /* SYNTAX RULES */

    static get _bodyTypes() {
        return [
            'SelectStmt',
            'TableStmt',
            'InsertStmt',
            'UpsertStmt',
            'UpdateStmt',
            'DeleteStmt',
            'ValuesConstructor',
        ];
    }

    static get syntaxRules() {
        const itemSeparator = { type: 'punctuation', value: ',' };
        return [
            { type: 'keyword', value: 'WITH' },
            { type: 'keyword', as: 'recursive', value: 'RECURSIVE', booleanfy: true, optional: true },
            { type: 'CTEItem', as: 'declarations', arity: { min: 1 }, itemSeparator, assert: true, autoIndent: 2 },
            { type: this._bodyTypes, as: 'body', assert: true, autoSpacing: '\n' },
        ];
    }

    /* AST API */

    recursive() { return this._get('recursive'); }

    declarations() { return this._get('declarations'); }

    body() { return this._get('body'); }

    /* JSON API */

    jsonfy(options = {}, transformer = null, linkedDb = null) {
        if (!options.deSugar) return super.jsonfy(options, transformer, linkedDb);

        let outerResultSchema;

        transformer = new Transformer((node, defaultTransform, keyHint) => {
            // Process CTEItem nodes
            if (node instanceof registry.CTEItem) {
                const cteResultJson = defaultTransform();

                const resultSchema = cteResultJson.result_schema;
                transformer.artifacts.get('tableSchemas').add({ type: 'CTEItem', resultSchema });

                return cteResultJson;
            }

            // Process body nodes
            if (keyHint === 'body' && node.parentNode === this) {
                const bodyResultJson = defaultTransform();

                outerResultSchema = bodyResultJson.result_schema;

                return bodyResultJson;
            }

            return defaultTransform();
        }, transformer, this);

        // Run transform
        const resultJson = super.jsonfy(options, transformer, linkedDb);
        return {
            ...resultJson,
            result_schema: outerResultSchema,
        };
    }
}