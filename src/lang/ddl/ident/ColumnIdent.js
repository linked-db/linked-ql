import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class ColumnIdent extends IdentifierPath {

    /* SYNTAX RULES */

    static get _objectKind() { return 'column'; }

    static get _qualifierType() { return 'TableRef'; }
}