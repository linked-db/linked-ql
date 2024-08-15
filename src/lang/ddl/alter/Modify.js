
import AbstractNode from '../AbstractNode.js';
import Column from '../../schema/tbl/Column.js';

export default class Modify extends AbstractNode {

	/**
	 * Instance props.
	 */
	ARGUMENT;

	/**
	 * @inheritdoc
	 */
	argument(argument) {
		if (!arguments.length) return this.ARGUMENT;
		return (this.build('ARGUMENT', [argument], this.constructor.NODE_TYPES), this);
	}

	/**
	 * @inheritdoc
	 */
	toJSON() { return { argument: this.ARGUMENT.toJSON(), ...super.toJSON(), }; }

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json) {
		if (!json?.kind || !json.argument) return;
        return super.fromJSON(context, json)?.argument(json.argument);
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() { return `${ this.CLAUSE } ${ this.KIND } ${ this.ARGUMENT }`; }
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, kind, argumentExpr ] = (new RegExp(`^${ this.CLAUSE }\\s+(${ this.KINDS.map(s => s).join('|') })\\s+([\\s\\S]+)$`, 'i')).exec(expr.trim()) || [];
		if (!match) return;
		const instance = new this(context, kind.toUpperCase());
		instance.argument(parseCallback(instance, argumentExpr, this.NODE_TYPES));
		return instance;
	}

	static get CLAUSE() { return 'MODIFY'; }
	static NODE_TYPES = [Column];
    static KINDS = ['COLUMN'];
}