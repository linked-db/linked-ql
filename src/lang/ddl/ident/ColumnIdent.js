import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class ColumnIdent extends IdentifierPath {

    /* SYNTAX RULES */

    static get _domainKind() { return 'column'; }

    static get _qualifierType() { return 'TableRef'; }
}