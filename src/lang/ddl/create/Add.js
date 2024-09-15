import AbstractNode from '../AbstractNode.js';
import IdentityConstraint from '../../schema/tbl/constraints/IdentityConstraint.js';
import TablePrimaryKey from '../../schema/tbl/constraints/TablePrimaryKey.js';
import TableForeignKey from '../../schema/tbl/constraints/TableForeignKey.js';
import TableUniqueKey from '../../schema/tbl/constraints/TableUniqueKey.js';
import CheckConstraint from '../../schema/tbl/constraints/CheckConstraint.js';
import Column from '../../schema/tbl/Column.js';
import Index from '../../schema/tbl/Index.js';

export default class Add extends AbstractNode {

	/**
	 * Instance props.
	 */
	ARGUMENT;

	argument(argument = undefined) {
		if (!arguments.length) return this.ARGUMENT;
		return (this.build('ARGUMENT', [argument], this.constructor.NODE_TYPES), this);
	}

	toJSON() { return { argument: this.ARGUMENT.toJSON(), ...super.toJSON(), }; }

	static fromJSON(context, json) {
		if (!json?.argument) return;
        return super.fromJSON(context, json)?.argument(json.argument);
	}
	
	stringify() {
		const stmts = [`${ this.CLAUSE }${ this.KIND && /^(COLUMN|TABLE|SCHEMA|DATABASE)$/i.test(this.KIND) ? ` ${ this.KIND.replace(/_/g, ' ') }${ this.hasFlag('IF_NOT_EXISTS') ? ' IF NOT EXISTS' : '' }` : '' } ${ this.argument() }`];
		if (this.argument() instanceof Column) {
			if (this.hasFlag('AFTER')) stmts.push(this.getFlag('AFTER')?.replace(':', ' '))
			else if (this.hasFlag('FIRST')) stmts.push('FIRST');
			const constraintToHandle = this.params.dialect === 'mysql' && this.argument().foreignKey();
			if (constraintToHandle) return [stmts.join(' '), `ADD ${ TableForeignKey.fromJSON(this, constraint.toJSON()).columns([this.argument().name()]) }`].join(';\n');
		}
		return stmts.join(' ');
	}
	
	static parse(context, expr, parseCallback) {
		const [ match, kind = '', ifNotExists, argumentExpr ] = (new RegExp(`^${ this.CLAUSE }\\s+(?:(${ this.KINDS.map(s => s.replace(/_/g, '\\s+')).join('|') })\\s+)?(IF\\s+NOT\\s+EXISTS\\s+)?([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.replace(/\s+/g, '_').toUpperCase());
		if (ifNotExists) instance.withFlag('IF_NOT_EXISTS');
		if (!kind || /^COLUMN$/i.test(kind)) {
			const [ , $argumentExpr, $first, $afterRef ] = argumentExpr.trim().match(/([\s\S]+)\s+(?:(FIRST)|AFTER\s+(.+))$/i) || [ , argumentExpr.trim() ];
			if ($first) instance.withFlag('FIRST');
			if ($afterRef) instance.withFlag(`AFTER:${ $afterRef }`);
			instance.argument(parseCallback(instance, $argumentExpr, [Column]));
		} else if (/^TABLE|SCHEMA|DATABASE$/i.test(kind)) {
			instance.argument(parseCallback(instance, argumentExpr, this.NODE_TYPES));
		} else {
			instance.argument(parseCallback(instance, `${ kind} ${ argumentExpr }`, this.NODE_TYPES));
		}
		return instance;
	}

	static get CLAUSE() { return 'ADD'; }
    static NODE_TYPES = [IdentityConstraint,TablePrimaryKey,TableForeignKey,TableUniqueKey,CheckConstraint,Index,Column];
    static KINDS = ['COLUMN','CONSTRAINT', 'PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE_KEY', 'CHECK', 'FULLTEXT_INDEX', 'SPATIAL_INDEX', 'INDEX', 'KEY'];
}