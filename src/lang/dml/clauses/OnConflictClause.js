import { Lexer } from '../../Lexer.js';
import { WhereClause } from '../../dql/clauses/WhereClause.js';
import { ColumnsSpec } from './ColumnsSpec.js';
import { SetClause } from './SetClause.js';

export class OnConflictClause extends SetClause {
	static get CLAUSE() {}

    #whereClause;
	#columnsSpec;

	columnsSpec(...args) {
		if (!arguments.length) return this.#columnsSpec;
		this.#columnsSpec = this.$castInputs(args, ColumnsSpec, this.#columnsSpec, 'columns_spec', 'add');
		return this;
	}

	where(...args) {
		if (!arguments.length) return this.#whereClause;
		this.#whereClause = this.$castInputs(args, WhereClause, this.#whereClause, 'where_clause', 'every');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json.columnsSpec) instance.columnsSpec(json.columnsSpec);
			if (json.whereClause) instance.where(json.whereClause);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}, reducer = null) {
		return super.jsonfy(options, {
			...(this.#columnsSpec ? { columnsSpec: this.#columnsSpec.jsonfy(options) } : {}),
			...(this.#whereClause ? { whereClause: this.#whereClause.jsonfy(options) } : {}),
			...jsonIn,
		}, reducer);
	}

	static get REGEX() { return 'ON\\s+(?:DUPLICATE\\s+KEY|CONFLICT(?:\\s+([\\s\\S]+?))?)\\s+(DO\\s+NOTHING|DO\\s+UPDATE\\s+SET\\s+|UPDATE)'; }
	static parse(context, expr, parseCallback) {
		const [ onConflictMatch, columnsSpec, action, updateSpec ] = expr.match(new RegExp(`^${ this.REGEX }([\\s\\S]*)$`, 'i')) || [];
		if (!onConflictMatch) return;
        if (/DO\s+NOTHING/i.test(action)) return new this(context);
        const [assignmentList, whereSpec] = Lexer.split(updateSpec, ['WHERE'], { useRegex: 'i', preserveDelims: true });
        const instance = super.parse(context, assignmentList, parseCallback);
        if (columnsSpec) instance.columnsSpec(parseCallback(instance, columnsSpec, [ColumnsSpec]));
        if (whereSpec) instance.where(parseCallback(instance, whereSpec.trim(), [WhereClause]));
        return instance;
    }

	stringify() {
		const sql = [];
       if (this.params.dialect === 'mysql') sql.push('ON DUPLICATE KEY UPDATE');
        else { sql.push(`ON CONFLICT ${ this.#columnsSpec ? `${ this.#columnsSpec } ` : '' }${ this.entries().length ? 'DO UPDATE SET' : 'DO NOTHING' }`); }
        sql.push(super.stringify());
		if (this.#whereClause) sql.push(this.#whereClause);
		return sql.join(' ');
	}
}