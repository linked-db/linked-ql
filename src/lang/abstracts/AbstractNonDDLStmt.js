import { ResultSchemaMixin } from './ResultSchemaMixin.js';
import { OriginSchemasMixin } from '../abstracts/OriginSchemasMixin.js';
import { AbstractStmt } from './AbstractStmt.js';

export class AbstractNonDDLStmt extends ResultSchemaMixin(OriginSchemasMixin(AbstractStmt)) {

	renderBindings(values) {
		if (!Array.isArray(values)) throw new Error(`Values must be an array`);
		const queryBindings = [...this.queryBindings()];
		for (let i = 0; i < values.length; i++) {
			const bindings = queryBindings.filter(b => b.offset() === i+1);
			if (!bindings.length) throw new Error(`No bindings exists at offset #${i}`);
			bindings.forEach(b => b.value(values[i]));
		}
	}

	normalizeBindings(dedupe = false) {
		const queryBindings = [...this.queryBindings()];
		if (!dedupe) {
			queryBindings.forEach((b, i) => b.offset(i+1));
			return queryBindings;
		}
		let redundants = new Map, $offset = 1;
		for (const b of queryBindings) {
			if (b.offset() === 0 || !redundants.has(b.offset())) {
				const newOffset = $offset++;
				redundants.set(b.offset(), newOffset);
				b.offset(newOffset);
			} else b.offset(redundants.get(b.offset())).withDetail('redundant', true);
		}
		return queryBindings.filter(b => !b.getDetail('redundant'));
	}
}
