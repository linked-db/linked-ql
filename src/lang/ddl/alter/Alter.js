import Literal from '../../components/Literal.js';
import Change from './Change.js';
import Add from '../create/Add.js';
import Drop from '../drop/Drop.js';
import Set from './Set.js';

export default class Alter extends Change {

	add(kind, argument) { return this.argument({ clause: 'ADD', kind, argument }); }

	drop(kind) { return this.argument({ clause: 'DROP', kind }); }

	set(kind, argument) { return this.argument({ clause: 'SET', kind, argument }); }

	static handleArgumentExpr(instance, expr, parseCallback) {
		if (/^(DATA\+)?TYPE\s+/i.test(expr)) instance.argument(parseCallback(instance, `SET ${ expr }`, [Set]));
		else instance.argument(parseCallback(instance, expr, this.NODE_TYPES));
	}

	static get CLAUSE() { return 'ALTER'; }
	static NODE_TYPES = [Add,Drop,Set,Literal];
    static KINDS = ['COLUMN', 'CONSTRAINT', 'INDEX'];
}