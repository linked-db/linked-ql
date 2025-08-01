import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';

export class TableIdent extends IdentifierPath {

	/* SYNTAX RULES */

	static get _objectKind() { return 'Table'; }

	static get _qualifierType() { return 'SchemaRef'; }
}