
import AbstractGroupBy from './abstracts/AbstractGroupBy.js';

export default class PartitionByClause extends AbstractGroupBy {

	/**
	 * @inheritdoc
	 */
	stringify() { return ['PARTITION BY', super.stringify()].join(' '); }

	/**
	 * @inheritdoc
	 */
	static regex = 'PARTITION\\s+BY';
}