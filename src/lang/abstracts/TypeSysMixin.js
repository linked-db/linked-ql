import { registry } from '../registry.js';

export const TypeSysMixin = (Class) => class extends Class {

	dataType() { return registry.DataType.fromJSON({ value: 'TEXT' }); };
}