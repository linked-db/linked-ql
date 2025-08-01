import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class ColumnIdent extends IdentifierPath {

    /* SYNTAX RULES */

    static get _objectKind() { return 'Column'; }

    static get _qualifierType() { return 'TableRef'; }
}