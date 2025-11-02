import { ReturningClause } from './clauses/ReturningClause.js';
import { AbstractNonDDLStatement } from '../AbstractNonDDLStatement.js';
import { AbstractNode } from "../AbstractNode.js";

export class AbstractDMLStatement extends AbstractNonDDLStatement(AbstractNode) {
    
    #returningClause;

	get statementType() { return 'DML'; }

	returning(...args) {
		if (!arguments.length) return this.#returningClause;
		this.#returningClause = this.$castInputs(args, ReturningClause, this.#returningClause, 'returning_clause', 'add');
		return this;
	}
	
	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json.returningClause) instance.returning(json.returningClause);
			callback?.(instance);
		});
	}

	jsonfy(options, jsonInCallback) {
		return super.jsonfy(options, () => ({
			...(this.#returningClause ? { returningClause: this.#returningClause.jsonfy(options) } : {}),
			...jsonInCallback(),
		}));
	}
}
