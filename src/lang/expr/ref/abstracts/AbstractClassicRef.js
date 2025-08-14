import { ErrorRefUnknown } from './ErrorRefUnknown.js';
import { ErrorRefAmbiguous } from './ErrorRefAmbiguous.js';
import { DDLSchemaMixin } from '../../../abstracts/DDLSchemaMixin.js';
import { TypeSysMixin } from '../../../abstracts/TypeSysMixin.js';
import { Identifier } from '../Identifier.js';

export class AbstractClassicRef extends DDLSchemaMixin(TypeSysMixin(Identifier)) {

    lookup(transformer, linkedDb) { return []; }

    resolve(transformer, linkedDb) {
        const resultSet = this.lookup(null, transformer, linkedDb) || [];
        const objectType = this.constructor.name.match(/schema/i) ? 'Schema' : (this.constructor.name.match(/table/i) ? 'Table' : 'Column');
        if (resultSet.length > 1) {
            throw new ErrorRefAmbiguous(`[${this.parentNode?.parentNode || this.parentNode || this}] ${objectType} ${this} is ambiguous. (Is it ${resultSet.join(' or ')}?)`);
        } else if (!resultSet.length) {
            throw new ErrorRefUnknown(`[${this.parentNode?.parentNode || this.parentNode || this}] ${objectType} ${this} does not exist.`);
        }
        return resultSet[0];
    }
}