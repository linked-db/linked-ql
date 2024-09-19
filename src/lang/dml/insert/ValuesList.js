import AbstractNode from '../../AbstractNode.js';
import Expr from '../../components/Expr.js';
import EntriesAPI from './EntriesAPI.js';

export default class ValuesList extends EntriesAPI(AbstractNode) {
	static Types = Expr.Types;
}