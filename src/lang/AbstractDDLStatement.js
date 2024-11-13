import { AbstractStatementNode } from './AbstractStatementNode.js';
import { AbstractSugar } from './AbstractSugar.js';
import { Lexer } from './Lexer.js';

export const AbstractDDLStatement = Class => class extends AbstractStatementNode(AbstractSugar(Class)) {
    static get CLAUSE() { return this.NODE_NAME.replace(/_DATABASE|_TABLE/gi, ''); }
        
    #returningClause;

    get statementType() { return 'DDL'; }

	returning(value) {
		if (!arguments.length) return this.#returningClause;
        if (!/^SCHEMA|SAVEPOINT$/i.test(value)) throw new Error(`Unsupported value for a RETURNING clause.`);
		this.#returningClause = value.toUpperCase();
		return this;
	}

    static fromJSON(context, json, callback = null) {
        // Let's set sensible default for kind
        const [kind] = this.NODE_NAME.match(/DATABASE|TABLE/);
        return super.fromJSON(context, { ...json, kind: json.kind || (kind === 'DATABASE' ? 'SCHEMA' : kind) }, (instance) => {
			if (json.returningClause) instance.returning(json.returningClause);
			callback?.(instance);
		});
    }

	jsonfy(options, jsonInCallback) {
		return super.jsonfy(options, () => ({
			...(this.#returningClause && !options.deSugar ? { returningClause: this.#returningClause } : {}),
			...jsonInCallback(),
		}));
	}

    static parse(context, expr, parseCallback) {
        let returningClause;
        if (/^CREATE|ALTER|DROP|RENAME/.test(expr)) {
            [expr, returningClause] = Lexer.split(expr, ['RETURNING'], { useRegex: 'i' }).map((s) => s.trim());
        }
        const instance = super.parse(context, expr, parseCallback);
        if (returningClause) instance?.returning(returningClause);
        return instance;
    }

	stringify() {
        const str = super.stringify();
        if (this.#returningClause) return `${str} RETURNING ${this.#returningClause}`;
        return str;
	}
}
