import { _toTitle } from '@webqit/util/str/index.js';
import { RefErrorAmbiguous } from './RefErrorAmbiguous.js';
import { RefErrorUnknown } from './RefErrorUnknown.js';
import { Identifier } from '../Identifier.js';

export class AbstractRef extends Identifier {
	static get PREFIX_TYPE() { return []; }
	
	#prefix;
	#autoPrefixed;
	#schema;

	get autoPrefixed() { return this.#autoPrefixed; }

	name(value) {
		if (arguments.length && value !== this.name()) this.#schema = null;
		return super.name(...arguments);
	}

	prefix(value) {
		if (value === true && !this.#prefix) {
			this.prefix('').schema();
			this.#autoPrefixed = true;
		}
		if (!arguments.length || typeof value === 'boolean') return this.#prefix;
		this.#prefix = this.$castInputs([value], this.constructor.PREFIX_TYPE, this.#prefix, 'prefix_spec');
		return this;
	}

	identifiesAs(value) {
		if (value instanceof AbstractRef) {
			return this.$eq(this.name(), value.name(), 'ci') 
			&& (!value.prefix() || !!this.prefix()?.identifiesAs(value.prefix()));
		}
		return super.identifiesAs(value);
	}

	schema(filter = null) {
		if (this.#schema) {
			if (filter) return filter(this.#schema) && [this.#schema] || [];
			return this.#schema;
		}
		const resultSchema = (schema) => {
			if (!schema) return;
			this.#schema = schema;
			if (this.#schema.name() && !this.name()) this.name(this.#schema.name());
			return this.#schema;
		};
		const name = this.name();
		const KIND = this.constructor.KIND, kind = KIND.toLowerCase();
		let superSchemas = [], subSchemas = [];
		// Can capture from context?
		const canCapture = /(TABLE|DATABASE)/.test(KIND) && !this.global;
		if (!canCapture || !(subSchemas = [].concat(this.contextNode?.capture(`${ KIND }_SCHEMA`)?.clone() || [])).length) {
			// Otherwise, search mode
			if (!filter && !name) return;
			const $getTarget = superSchema => superSchema?.[kind](name);
			superSchemas = /DATABASE$/.test(KIND) ? [this.capture('ROOT_SCHEMA')] : this.prefix(true).schema(subSchema => name ? $getTarget(subSchema) : /*all*/true);
			subSchemas = superSchemas.reduce((subSchemas, subSchema) => subSchemas.concat(name ? ($getTarget(subSchema) || []) : /*all*/subSchema[`${ kind }s`]()), []);
		}
		if (filter) {
			// Return all filtered results. Duplicacy errors will be handled there
			const subSchemas_filtered = subSchemas.filter(filter);
			if (subSchemas_filtered.length === 1) resultSchema(subSchemas_filtered[0]);
			return subSchemas_filtered;
		}
		if (subSchemas.length > 1) {
			// This was a search by name, so we handle the errors here
			throw new RefErrorAmbiguous(`[${ this.contextNode?.clone({ fullyQualified: true }) }]: ${ _toTitle(kind) } ${ this.stringifyIdent(name) } is ambiguous. (Is it ${ superSchemas.map(s => this.stringifyIdent([s.name(), name])).join(' or ') }?)`);
		} else if (!resultSchema(subSchemas[0])) {
			// Same idea as above
			throw new RefErrorUnknown(`[${ this.clone({ fullyQualified: true }) }]: Unknown ${ kind }: ${ this.stringifyIdent(name) }`);
		}
		return this.#schema;
	}

	static fromJSON(context, json, callback = null) {
		if (typeof json === 'string') json = { name: json };
		else if (Array.isArray(json) && json.some(s => typeof s === 'string') && (json = json.slice())) {
			json = { name: json.pop(), prefix: json.pop() };
		} else if (typeof json?.name !== 'string') return;
		return super.fromJSON(context, json, (instance) => {
			if (json.prefix) instance.prefix(json.prefix);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		const prefix = ((!this.#autoPrefixed || options.deSugar || options.fullyQualified) && this.#prefix)?.jsonfy?.(options);
		return super.jsonfy(options, {
			...(prefix?.name ? { prefix: prefix } : {}),
			...jsonIn
		});
	}
	
	static parse(context, expr, parseCallback) {
		if (/^(TRUE|FALSE|NULL)$/i.test(expr)) return;
		const [name, ...prefix] = this.parseIdent(context, expr).reverse();
		if (!name) return;
		const instance = (new this(context)).name(name);
		if (prefix.length) instance.prefix(prefix);
		return instance;
	}
	
	stringify() { return [].concat(!this.#autoPrefixed && this.#prefix?.stringify() || [], this.stringifyIdent(this.name())).join('.'); }
}