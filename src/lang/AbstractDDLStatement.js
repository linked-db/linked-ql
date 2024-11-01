import { AbstractStatementNode } from './AbstractStatementNode.js';

export const AbstractDDLStatement = Class => class extends AbstractStatementNode(Class) {
    static get CLAUSE() { return this.NODE_NAME.replace(/_DATABASE|_TABLE/gi, ''); }

    get statementType() { return 'DDL'; }

    static fromJSON(context, json, callback = null) {
        // Let's set sensible default for kind
        const [kind] = this.NODE_NAME.match(/DATABASE|TABLE/);
        return super.fromJSON(context, { kind: kind === 'DATABASE' ? 'SCHEMA' : kind, ...json }, callback);
    }
}
