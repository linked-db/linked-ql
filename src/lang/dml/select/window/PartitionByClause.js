
import AbstractGroupBy from '../groupby/AbstractGroupBy.js';

export default class PartitionByClause extends AbstractGroupBy {

	stringify() { return ['PARTITION BY', super.stringify()].join(' '); }

	static regex = 'PARTITION\\s+BY';
}