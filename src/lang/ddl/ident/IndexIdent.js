import { PathMixin } from '../../abstracts/PathMixin.js';
import { Identifier } from '../../expr/index.js';

export class IndexIdent extends PathMixin(Identifier) {

    /* SYNTAX RULES */

    static get _qualifierType() { return 'NamespaceRef'; }
}
