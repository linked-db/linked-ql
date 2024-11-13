import { AbstractAction } from '../../abstracts/AbstractAction.js';
import { AbstractArgumentMixin } from '../../abstracts/AbstractArgumentMixin.js';
import { PrimaryKeyConstraint } from '../../constraints/PrimaryKeyConstraint.js';
import { ForeignKeyConstraint } from '../../constraints/ForeignKeyConstraint.js';
import { UniqueKeyConstraint } from '../../constraints/UniqueKeyConstraint.js';
import { CheckConstraint } from '../../constraints/CheckConstraint.js';
import { ColumnSchema } from '../../column/ColumnSchema.js';
import { ColumnRef } from '../../../expr/refs/ColumnRef.js';
import { Identifier } from '../../../expr/Identifier.js';
import { IndexSchema } from '../../index/IndexSchema.js';

export class Add extends AbstractArgumentMixin(AbstractAction) {
	static get EXPECTED_TYPES() {
        return {
            COLUMN: [ColumnSchema],
            CONSTRAINT: [PrimaryKeyConstraint, ForeignKeyConstraint, UniqueKeyConstraint, CheckConstraint],
			INDEX: [IndexSchema],
        };
    }

    static get REF_TYPES() {
        return {
            COLUMN: [ColumnRef],
            CONSTRAINT: [Identifier],
			INDEX: [Identifier],
        };
    }

	get $KIND() { return this.KIND === 'COLUMN' ? this.argument()?.type()?.name() : this.argument()?.TYPE; }
	
	#first;
	#after;

	first(value) {
		if (!arguments.length) return this.#first;
		return (this.#first = !!value, this);
	}

	after(value) {
		if (!arguments.length) return this.#after;
		this.#after = this.$castInputs([value], this.constructor.REF_TYPES[this.KIND], this.#after, 'ref');
		return this;
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json.first) instance.first(true);
			if (json.after) instance.after(json.after);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			...(this.#first ? { first: true } : {}),
			...(this.#after ? { after: this.#after.jsonfy(options) } : {}),
			...jsonIn
		});
	}

	static parse(context, expr, parseCallback, argParseCallback = null) {
		let autoFiguredKind;
		let [, kindExpr, argumentExpr, afterRef, first] = expr.match(new RegExp(`^${this.CLAUSE}\\s+(?:(${Object.keys(this.EXPECTED_TYPES).join('|')})\\s+)?([\\s\\S]+?)(?:\\s+AFTER\\s+(.+)|\\s+(FIRST))?$`, 'i')) || [];
		if (!kindExpr) {
			if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK)/i.test(argumentExpr)) {
				kindExpr = 'CONSTRAINT';
				autoFiguredKind = true;
			} else if (/^(FULLTEXT|SPATIAL)/i.test(argumentExpr)) {
				kindExpr = 'INDEX';
				autoFiguredKind = true;
			} else if (argumentExpr) kindExpr = 'COLUMN';
		}
		if (!kindExpr) return;
		const instance = new this(context, kindExpr.toUpperCase());
		if (instance.CLAUSE === 'ADD') {
			const [, ifNotExists, $argumentExpr] = argumentExpr.match(/(IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i);
			if (ifNotExists) instance.withFlag('IF_NOT_EXISTS');
			argumentExpr = $argumentExpr;
		}
		// Handle positional details
		if (afterRef) instance.after(parseCallback(instance, afterRef, this.REF_TYPES[instance.KIND]));
		else if (first) instance.first();
		// Handle argument
		const argument = (argParseCallback || parseCallback)(instance, instance.KIND === 'COLUMN' || autoFiguredKind ? argumentExpr : `${instance.KIND} ${argumentExpr}`, this.EXPECTED_TYPES[instance.KIND]);
		return instance.argument(argument);
	}

	stringify() {
		const sql = [this.CLAUSE];
		if (this.hasFlag('IF_NOT_EXISTS')) sql.push('IF NOT EXISTS');
		sql.push(this.argument());
		if (this.#first) sql.push('FIRST');
		else if (this.#after) sql.push('AFTER', this.#after);
        return sql.join(' ');
	}
}