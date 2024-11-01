import { PathRight } from '../../expr/path/PathRight.js';
import { AbstractNodeList } from '../../expr/abstracts/AbstractNodeList.js';
import { Assignment } from '../../expr/operators/Assignment.js';
import { ColumnsSpec } from './ColumnsSpec.js';
import { RowSpec } from './RowSpec.js';

export class SetClause extends AbstractNodeList {
    static get EXPECTED_TYPES() { return [Assignment]; }
    static get CLAUSE() { return 'SET'; }

    columns() {
        return this.entries().reduce((cols, assignment) => {
            if (assignment.lhs() instanceof ColumnsSpec) return cols.concat(assignment.lhs().entries());
            return cols.concat(assignment.lhs());
        }, []);
    }

    values() {
        return this.entries().reduce((vals, assignment) => {
            if (assignment.rhs() instanceof RowSpec) return vals.concat(assignment.rhs().entries());
            return vals.concat(assignment.rhs());
        }, []);
    }

    assignment(lhs, rhs) {
        return this.add(this.$castInputs([lhs, rhs], this.constructor.EXPECTED_TYPES, null, 'assignment', 'operands'));
    }
	
	jsonfy(options = {}, jsonIn = {}, reducer = null) {
		if (!options.deSugar || !this.statementNode) return super.jsonfy(options, jsonIn, reducer);
		return super.jsonfy(options, jsonIn, /*reducer*/assignment => {
            // Handle bare assignment exoressions
			if (assignment.lhs() instanceof PathRight) {
				const [ dimension, resolvedFk ] = this.statementNode.createDimension(assignment.lhs(), options);
				const fKBinding = dimension.offlaod(0, assignment.rhs());
				if (!resolvedFk) return;
				return {
					nodeName: Assignment.NODE_NAME,
					lhs: resolvedFk,
					rhs: fKBinding,
					operator: '='
				};
			}
			// Handle compound assignment exoressions
			if (assignment.lhs() instanceof ColumnsSpec) {
				const $options = { ...options, explicitRowOffset: 0 };
				const [ reducedColumsSpec, [ reducedRowSpec ] ] = this.statementNode.filterPayload(assignment.lhs(), [ assignment.rhs() ], $options);
				if (reducedColumsSpec.entries.length) return;
				return {
					nodeName: Assignment.NODE_NAME,
					lhs: reducedColumsSpec,
					rhs: reducedRowSpec,
					operator: '='
				};
			}
			return true;
		});
	}
}