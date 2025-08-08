import { PathMixin } from '../../abstracts/PathMixin.js';
import { Identifier } from '../../expr/index.js';

export class TableIdent extends PathMixin(Identifier) {

	/* SYNTAX RULES */
	
	static get _qualifierType() { return 'SchemaRef'; }
}