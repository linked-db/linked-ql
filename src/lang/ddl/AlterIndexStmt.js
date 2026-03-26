import { DDLStmt } from './DDLStmt.js';
import { registry } from '../registry.js';

export class AlterIndexStmt extends DDLStmt {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof AlterIndexStmt) return super.fromJSON(inputJson, options, callback);
        const { nodeName, subject, actions } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!subject || !actions) return;
        return new this({
            subject: registry.IndexIdent.fromJSON(subject, options),
            actions: registry.IndexDiff.fromJSON(actions, options),
        }, options);
    }

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ALTER' },
            {
                syntaxes: [
                    { type: 'keyword', value: 'INDEX' },
                    { type: 'identifier', value: 'INDEX' },
                ],
            },
            { type: ['IndexIdent', 'Identifier'/* to support mock names */], as: 'subject' },
            { type: 'IndexDiff', as: 'actions', assert: true },
        ];
    }

    /* AST API */

    subject() { return this._get('subject'); }

    actions() { return this._get('actions'); }
}
