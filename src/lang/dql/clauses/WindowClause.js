import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { Window } from './Window.js';

export class WindowClause extends AbstractNodeList {
	static get EXPECTED_TYPES() { return [Window]; }
	static get CLAUSE() { return 'WINDOW'; }
}