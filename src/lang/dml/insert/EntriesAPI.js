import Lexer from '../../Lexer.js';
import { _wrapped, _unwrap } from '@webqit/util/str/index.js';

export default Class => class extends Class {

    ENTRIES = [];

    get length() { return this.ENTRIES.length; }

    entries(...entries) {
        if (!arguments.length) return this.ENTRIES;
        return (this.build('ENTRIES', entries, this.constructor.Types), this);
    }

	getEntry(ref) { return this.ENTRIES[ref]; }

	removeEntry(ref) {
		const entry = this.getEntry(ref);
		if (entry) this.ENTRIES = this.ENTRIES.filter($entry => $entry !== entry);
		if (entry) entry.$trace('event:DISCONNECTED', entry);
		return entry;
	}

	filterInplace(callback) {
		return this.ENTRIES = this.ENTRIES.filter((entry, i) => {
			const shouldRetain = callback(entry, i);
			if (!shouldRetain) entry.$trace('event:DISCONNECTED', entry);
			return shouldRetain;
		});
	}

	toJSON() { return { entries: this.ENTRIES.map(entry => entry.toJSON()) }; }

	static fromJSON(context, json) {
		if (!Array.isArray(json?.entries)) return;
        const instance = new this(context);
        for (const entry of json.entries) instance.entries(entry);
		return instance;
	}
	
	stringify() { return `(${ this.ENTRIES.join(', ') })`; }
	
	static parse(context, expr, parseCallback) {
		if (!_wrapped(expr, '(', ')')) return;
		const instance = new this(context);
		instance.entries(...Lexer.split(_unwrap(expr, '(', ')'), [',']).map(entry => parseCallback(instance, entry.trim(), this.Types)));
		return instance;
	}
}