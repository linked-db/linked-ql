import { ErrorRefUnknown } from './ErrorRefUnknown.js';
import { ErrorRefAmbiguous } from './ErrorRefAmbiguous.js';
import { DDLSchemaMixin } from '../../../abstracts/DDLSchemaMixin.js';
import { TypeSysMixin } from '../../../abstracts/TypeSysMixin.js';
import { Identifier } from '../Identifier.js';

export class AbstractClassicRef extends DDLSchemaMixin(TypeSysMixin(Identifier)) {

    lookup(linkedContext, linkedDb) { return []; }

    resolve(linkedContext, linkedDb) {
        const resultSet = this.lookup(null, linkedContext, linkedDb) || [];
        if (resultSet.length > 1) {
            throw new ErrorRefAmbiguous(`[${this.parentNode || this}] Column ${this} is ambiguous. (Is it ${resultSet.join(' or ')}?)`);
        } else if (!resultSet.length) {
            throw new ErrorRefUnknown(`[${this.parentNode || this}] Column ${this} does not exist.`);
        }
        return resultSet[0];
    }
}