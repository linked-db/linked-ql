import { Lexer } from "./Lexer.js";
import { AbstractStatementNode } from "./AbstractStatementNode.js";
import { RootSchema } from "../lang/ddl/RootSchema.js";
import { Binding } from "./expr/Binding.js";

export const AbstractNonDDLStatement = Class => class extends AbstractStatementNode(Class) {

	#uuid;
	#queryBindings = new Set;
	#querySugars = new Set;

	get uuid() {
		if (!this.#uuid) this.#uuid = `scope_${(0 | Math.random() * 9e6).toString(36)}`;
		return this.#uuid;
	}

	get queryBindings() { return [...this.#queryBindings].sort((a, b) => b.offset() === 0 || b.offset() > a.offset() ? -1 : 1); }

	get querySugars() { return this.#querySugars; }

	get hasSugars() { return this.isSugar || !!this.#querySugars.size; }

	get hasPaths() { return [...this.#querySugars].some(s => s.isPath); }

	$bubble(eventType, eventSource) {
		if (['CONNECTED', 'DISCONNECTED'].includes(eventType)
			&& (eventSource.isSugar || [Binding].some(x => eventSource instanceof x))) {
			const collection = eventSource.isSugar ? this.#querySugars : this.#queryBindings;
			if (eventType === 'DISCONNECTED') collection.delete(eventSource);
			else collection.add(eventSource);
			return; // Don't bubble beyond this point. think dimensional queries
		}
		return super.$bubble(eventType, eventSource);
	}

	$capture(requestName, requestSource) {
		const result = super.$capture(requestName, requestSource);
		if (requestName === 'ROOT_SCHEMA' && !result) return RootSchema.fromJSON(this, []);
		return result;
	}

	renderBindings(values) {
		if (!Array.isArray(values)) throw new Error(`Values must be an array`);
		const queryBindings = [...this.#queryBindings];
		for (let i = 0; i < values.length; i++) {
			const bindings = queryBindings.filter(b => b.offset() === i+1);
			if (!bindings.length) throw new Error(`No bindings exists at offset #${i}`);
			bindings.forEach(b => b.value(values[i]));
		}
	}

	normalizeBindings(dedupe = false) {
		const queryBindings = [...this.#queryBindings];
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
	
	static mySubstitutePlaceholders(context, expr) {
		if ((context?.params?.inputDialect || context?.params?.dialect) !== 'mysql' || expr.indexOf('?') === -1) return expr;
		return Lexer.split(expr, ['?'], { blocks: [] }).reduce((expr, chunk, i) => !expr ? chunk : expr + '?' + i + chunk, null);
	}

	static fromJSON(context, json, callback = null) {
		return super.fromJSON(context, json, (instance) => {
			if (json.uuid) instance.#uuid = json.uuid;
			callback?.(instance);
		});
	}

	jsonfy(options, jsonInCallback) {
		const json = super.jsonfy(options, jsonInCallback);
		return this.finalizeJSON(json, options);
	}

	finalizeJSON(json, options) {
		return {
			...(this.#uuid ? { uuid: this.#uuid } : {}),
			...json
		};
	}
}
