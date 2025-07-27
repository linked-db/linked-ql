//import { RootSchema } from "../ddl/RootSchema.js";
//import { Binding } from "../expr/Binding.js";

import { AbstractStmt } from './AbstractStmt.js';

export class AbstractNonDDLStmt extends AbstractStmt {

	_capture(requestName, requestSource) {
		const result = super._capture(requestName, requestSource);
		if (requestName === 'CONTEXT.ROOT_SCHEMA' && !result) {
			return RootSchema.fromJSON(this, []);
		}
		return result;
	}

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
