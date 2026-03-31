import { DDLStmt } from './DDLStmt.js';
import { registry } from '../registry.js';

export class AlterViewStmt extends DDLStmt {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof AlterViewStmt) return super.fromJSON(inputJson, options, callback);
        const { nodeName, subject, actions } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!subject || !actions) return;
        return new this({
            subject: registry.TableIdent.fromJSON(subject, options),
            actions: registry.ViewDiff.fromJSON(actions, options),
        }, options);
    }

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ALTER' },
            { type: 'keyword', value: 'VIEW' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_exists', value: 'IF', booleanfy: true },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            { type: 'TableIdent', as: 'subject' },
            { type: 'ViewDiff', as: 'actions', assert: true },
        ];
    }

    /* AST API */

    ifExists() { return this._get('if_exists'); }

    subject() { return this._get('subject'); }

    actions() { return this._get('actions'); }
}
