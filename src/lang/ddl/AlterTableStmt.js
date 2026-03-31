import { DDLStmt } from './DDLStmt.js';
import { registry } from '../registry.js';

export class AlterTableStmt extends DDLStmt {

    static fromJSON(inputJson, options = {}, callback = null) {
        if (inputJson instanceof AlterTableStmt) return super.fromJSON(inputJson, options, callback);
        const { nodeName, subject, actions } = inputJson || {};
        if (nodeName && nodeName !== this.NODE_NAME) return;
        if (!subject || !actions) return;
        return new this({
            subject: registry.TableIdent.fromJSON(subject, options),
            actions: registry.TableDiff.fromJSON(actions, options),
        }, options);
    }

    static get syntaxRules() {
        return [
            { type: 'keyword', value: 'ALTER' },
            { type: 'keyword', value: 'TABLE' },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'if_exists', value: 'IF', booleanfy: true },
                    { type: 'keyword', value: 'EXISTS' },
                ],
            },
            { type: 'TableIdent', as: 'subject' },
            { type: 'TableDiff', as: 'actions', assert: true },
        ];
    }

    ifExists() { return this._get('if_exists'); }

    subject() { return this._get('subject'); }

    actions() { return this._get('actions'); }
}
