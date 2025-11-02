import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { Field } from './Field.js';

export class FieldsSpec extends AbstractNodeList {
    static get EXPECTED_TYPES() { return [Field]; }
}