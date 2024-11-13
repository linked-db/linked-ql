import { AbstractNameableNode } from '../abstracts/AbstractNameableNode.js';
import { AbstractColumnsMixin } from '../abstracts/AbstractColumnsMixin.js';
import { IndexCDL } from './IndexCDL.js';
import { Lexer } from '../../Lexer.js';

export class IndexSchema extends AbstractColumnsMixin(AbstractNameableNode) {

	#type;
	#$type;

	type(value) {
		if (!arguments.length) return this.#type;
		if (typeof value !== 'string') throw new Error(`The "type" directive must be of type string. Recieved ${value}`);
		if (this.$diffTagHydrate()) {
			this.#$type = value;
		} else this.#type = value;
		return this;
    }

	$type() { return this.#$type ?? this.#type; }

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['type'])
		);
	}
	
	renderCDL(columnCDL, options) {
        let json = this.jsonfy(options);
        return json;
    }

    generateCDL() {
        const indexCDL = IndexCDL.fromJSON(this, { actions: [] });
        return indexCDL;
    }

    generateDiff(nodeB, options) {
		return this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
			type: this.$type(),
		}, {
			type: nodeB.$type(),
		}, options);
    }

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		if (!/^(INDEX|KEY|FULLTEXT)$/i.test(json.type)) return;
		return super.fromJSON(context, json, (instance) => {
			instance.type(json.type);
			instance.$diffTagHydrate(json.$type, ($type) => instance.type($type));
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
            type: this.#type,
			...(this.#$type ? { $type: this.#$type } : {}),
			...jsonIn
		});
	}

    static checkIsColumn(contextNode) { return false; }

	static parse(context, expr) {
		const [ match, type, rest ] = /^((?:(?:FULLTEXT|SPATIAL)(?:\s+INDEX|\s+KEY)?)|(?:INDEX|KEY))([\s\S]+)$/i.exec(expr) || [];
        if (!match) return;
		const instance = new this(context);
		const [ nameExpr, columnsExpr ] = Lexer.split(rest, []);
		const [name] = this.parseIdent(context, nameExpr.trim());
        return instance
			.type(type.replace(/\s+(INDEX|KEY)/i, '').toUpperCase())
			.columns(this.parseColumns(instance, columnsExpr))
			.name(name);
    }
	
	stringify() { return `${ this.$type() }${ this.$name() ? ` ${ this.stringifyIdent(this.$name()) }` : '' }${ this.stringifyColumns() }`; }
}