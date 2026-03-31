import { DDLStmt } from './DDLStmt.js';
import { registry } from '../registry.js';

export class AlterSchemaStmt extends DDLStmt {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof AlterSchemaStmt) return super.fromJSON(inputJson, options, callback);
        const { nodeName, subject, actions, my_keyword } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!subject || !actions) return;
        return new this({
            my_keyword,
            subject: registry.NamespaceIdent.fromJSON(subject, options),
            actions: registry.NamesapceDiff.fromJSON(actions, options),
        }, options);
    }

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ALTER' },
            { type: 'keyword', value: 'SCHEMA', dialect: 'postgres' },
            {
                dialect: 'mysql',
                syntaxes: [
                    { type: 'keyword', as: 'my_keyword', value: 'SCHEMA' },
                    { type: 'keyword', as: 'my_keyword', value: 'DATABASE' },
                ],
            },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_exists', value: 'IF', booleanfy: true },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            { type: 'NamespaceIdent', as: 'subject' },
            { type: 'NamesapceDiff', as: 'actions', assert: true },
        ];
    }

    myKeyword() { return this._get('my_keyword'); }

    ifExists() { return this._get('if_exists'); }

    subject() { return this._get('subject'); }

    actions() { return this._get('actions'); }
}
