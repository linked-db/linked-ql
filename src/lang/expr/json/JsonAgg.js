import { Exprs } from '../grammar.js';
import { AbstractSugar } from '../../AbstractSugar.js';
import { ColumnsSpec } from '../../dml/clauses/ColumnsSpec.js';
import { RowSpec } from '../../dml/clauses/RowSpec.js';
import { AbstractNode } from '../../AbstractNode.js';
import { Aggr } from '../functions/Aggr.js';

export class JsonAgg extends AbstractSugar(AbstractNode) {
	static get DESUGARS_TO() { return [Aggr]; }
    static get EXPECTED_TYPES() { return Exprs.map(e => e === RowSpec ? ColumnsSpec : e);  }

    #expr;

    expr(value) {
        if (!arguments.length) return this.#expr;
        this.#expr = this.$castInputs([value], this.constructor.EXPECTED_TYPES, this.#expr, 'json_aggr_expr');
        return this;
    }

    static fromJSON(context, json, callback = null) {
		if (!json?.expr) return;
		return super.fromJSON(context, json, (instance) => {
            instance.expr(json.expr);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
        if (options.deSugar) {
            const agg = {
                nodeName: Aggr.NODE_NAME,
                name: this.params.dialect === 'mysql' ? 'JSON_ARRAYAGG' : 'JSON_AGG',
                args: [ this.#expr?.jsonfy(options) ],
                prettyName: this.stringify(),
            };
            return agg;
        }
		return super.jsonfy(options, {
			expr: this.#expr?.jsonfy(options),
			...jsonIn,
		});
	}

	static parse(context, expr, parseCallback) {
        if ((expr = expr.split(/(?=\[\s*\]$)/)).length !== 2) return;
		const instance = new this(context);
        return instance.expr(parseCallback(instance, expr.shift().trim(), this.EXPECTED_TYPES));
	}

	stringify() { return `${ this.#expr }[]`; }
}