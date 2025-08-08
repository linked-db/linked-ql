import { SugarMixin } from '../../abstracts/SugarMixin.js';
import { TypeSysMixin } from '../../abstracts/TypeSysMixin.js';
import { AbstractNodeList } from '../../abstracts/AbstractNodeList.js';
import { registry } from '../../registry.js';

export class AbstractLQJsonLiteral extends SugarMixin(TypeSysMixin(AbstractNodeList)) {

    dataType() { return registry.DataType.fromJSON({ value: 'JSON' }); }
}