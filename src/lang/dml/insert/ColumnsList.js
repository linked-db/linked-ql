import AbstractNode from '../../AbstractNode.js';
import Identifier from '../../components/Identifier.js';
import EntriesAPI from './EntriesAPI.js';

export default class ColumnsList extends EntriesAPI(AbstractNode) {
	getEntry(ref) {
		if (typeof ref === 'number') return super.getEntry(ref);
		return this.ENTRIES.find(entry => entry.name().toLowerCase() === ref.toLowerCase());
	}
	static Types = [Identifier];
}