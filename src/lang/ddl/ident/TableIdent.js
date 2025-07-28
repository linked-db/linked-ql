import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class TableIdent extends IdentifierPath {

	/* SYNTAX RULES */

	static get _domainKind() { return 'table'; }

	static get _qualifierType() { return 'DatabaseRef'; }
}