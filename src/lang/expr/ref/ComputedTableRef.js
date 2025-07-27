import { AbstractClassicRef } from './abstracts/AbstractClassicRef.js';
import { QualifierMixin } from './abstracts/QualifierMixin.js';

export class ComputedTableRef extends QualifierMixin(AbstractClassicRef) {

    /* SYNTAX RULES */

    static get _refKind() { return 'table'; }

    static get _qualifierType() { return 'ClassicDatabaseRef'; }

    static get syntaxRules() {
        return [
            {
                optional: true,
                syntaxes: [
                    [
                        { type: this._qualifierType, as: 'qualifier', peek: [3, 'punctuation', '.'] },
                        { type: 'punctuation', value: '.', assert: true, autoSpacing: false },
                    ],
                    [
                        { type: this._qualifierType, as: 'qualifier', peek: [1, 'version_spec'] },
                        { type: 'punctuation', value: '.', assert: true, autoSpacing: false },
                    ]
                ],
            },
            { ...[].concat(super.syntaxRules)[0], autoSpacing: false },
        ];
    }

    static get syntaxPriority() { return -1; }

    /* API */

    selectSchema(filter = null) {
        const name = this.value();
        const databaseSchemaInScope = this.capture('CONTEXT.QUERY_SCHEMA');
        const tableSchemas = name
            ? [].concat(databaseSchemaInScope?.table(name) || [])
            : databaseSchemaInScope.tables();
        return filter ? tableSchemas.filter(filter) : tableSchemas;
    }
}